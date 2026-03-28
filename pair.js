import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// WhatsApp Channel Link
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VatokI45EjxufALmY32X';

// Ensure sessions directory exists
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions', { recursive: true });
    console.log('✅ Created sessions directory');
}

// Function to remove files/directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        console.log(`🧹 Cleaned up: ${FilePath}`);
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    console.log('📱 Pairing request received');
    let num = req.query.number;
    
    // Validate input
    if (!num) {
        console.log('❌ No number provided');
        return res.status(400).json({
            success: false,
            error: 'MISSING_NUMBER',
            message: 'Phone number is required. Please enter your WhatsApp number with country code.'
        });
    }
    
    console.log(`📞 Processing number: ${num}`);
    
    // Create unique session directory with timestamp to avoid conflicts
    const sessionId = Date.now();
    const dirs = `./sessions/session_${sessionId}`;
    
    // Clean the phone number - remove any non-digit characters
    let cleanNum = num.replace(/[^0-9]/g, '');
    
    // Validate the phone number
    const phone = pn('+' + cleanNum);
    if (!phone.isValid()) {
        console.log(`❌ Invalid phone number: ${cleanNum}`);
        return res.status(400).json({
            success: false,
            error: 'INVALID_NUMBER',
            message: 'Invalid phone number. Please enter a valid international number (e.g., 2349079055953 for Nigeria)',
            hint: 'Include country code without the + symbol'
        });
    }
    
    // Use the international number format (E.164, without '+')
    const internationalNum = phone.getNumber('e164').replace('+', '');
    let pairingCode = null;
    let responseSent = false;
    let sessionActive = true;
    
    console.log(`✅ Valid number: +${internationalNum}`);
    console.log(`📁 Session directory: ${dirs}`);

    async function initiateSession() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);
            const { version } = await fetchLatestBaileysVersion();
            
            console.log(`🔄 Creating WhatsApp socket (version: ${version})...`);
            
            let ZukoBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 30000,
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 3,
            });

            // Handle connection updates
            ZukoBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin } = update;

                if (connection === 'open' && sessionActive) {
                    console.log("✅ WhatsApp connection established!");
                    
                    try {
                        const userJid = jidNormalizedUser(internationalNum + '@s.whatsapp.net');
                        
                        // Send the pairing code via WhatsApp
                        if (pairingCode) {
                            console.log(`📤 Sending pairing code ${pairingCode} to WhatsApp...`);
                            await ZukoBot.sendMessage(userJid, {
                                text: `🔐 *ZUKO-MD Pairing Code*\n\nYour 8-digit pairing code: *${pairingCode}*\n\n⚠️ *Do not share this code with anyone!*\n\nUse this code to link your WhatsApp device.\n\n📢 Join our channel: ${CHANNEL_LINK}`
                            });
                            console.log("✅ Pairing code sent via WhatsApp!");
                        }
                        
                        // Send session file if exists
                        const credsPath = dirs + '/creds.json';
                        if (fs.existsSync(credsPath)) {
                            const sessionKnight = fs.readFileSync(credsPath);
                            await ZukoBot.sendMessage(userJid, {
                                document: sessionKnight,
                                mimetype: 'application/json',
                                fileName: 'creds.json',
                                caption: '📱 *ZUKO-MD Session File*\n\nSave this file securely.'
                            });
                            console.log("📄 Session file sent");
                        }
                        
                        // Send channel invitation
                        await ZukoBot.sendMessage(userJid, {
                            text: `📢 *Join ZUKO-MD Official Channel*\n\n${CHANNEL_LINK}\n\n✨ Get updates and support!`
                        });
                        console.log("✅ Channel invitation sent");
                        
                        // Clean up after delay
                        setTimeout(() => {
                            if (sessionActive) {
                                removeFile(dirs);
                                sessionActive = false;
                            }
                        }, 3000);
                        
                    } catch (error) {
                        console.error("❌ Error sending WhatsApp messages:", error);
                    }
                }

                if (connection === 'close') {
                    console.log("🔌 Connection closed");
                    if (sessionActive) {
                        setTimeout(() => removeFile(dirs), 1000);
                        sessionActive = false;
                    }
                }
            });

            // Request pairing code if not registered
            if (!ZukoBot.authState.creds.registered && !responseSent) {
                await delay(2000);
                
                try {
                    console.log(`📡 Requesting pairing code for +${internationalNum}...`);
                    let code = await ZukoBot.requestPairingCode(internationalNum);
                    pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    console.log(`✅ Pairing code generated: ${pairingCode}`);
                    
                    // Send response to frontend
                    if (!responseSent) {
                        responseSent = true;
                        res.json({
                            success: true,
                            code: pairingCode,
                            phone: '+' + internationalNum,
                            message: 'Pairing code generated! Check your WhatsApp for the code notification.',
                            whatsapp_status: 'pending',
                            channel_link: CHANNEL_LINK
                        });
                        console.log(`📤 Response sent to frontend with code: ${pairingCode}`);
                    }
                    
                } catch (error) {
                    console.error('❌ Error requesting pairing code:', error);
                    if (!responseSent) {
                        responseSent = true;
                        res.status(503).json({
                            success: false,
                            error: 'PAIRING_FAILED',
                            message: 'Failed to generate pairing code. Please check your phone number and try again.',
                            details: error.message
                        });
                    }
                    removeFile(dirs);
                }
            }

            ZukoBot.ev.on('creds.update', saveCreds);
            
            // Auto cleanup after 20 seconds
            setTimeout(() => {
                if (sessionActive) {
                    console.log("⏰ Session timeout, cleaning up...");
                    removeFile(dirs);
                    sessionActive = false;
                }
            }, 20000);
            
        } catch (err) {
            console.error('❌ Error initializing session:', err);
            if (!responseSent) {
                responseSent = true;
                res.status(503).json({
                    success: false,
                    error: 'SERVICE_UNAVAILABLE',
                    message: 'Service temporarily unavailable. Please try again.',
                    details: err.message
                });
            }
            removeFile(dirs);
        }
    }

    await initiateSession();
});

// Global error handlers
process.on('uncaughtException', (err) => {
    const e = String(err);
    const ignoreErrors = ["conflict", "not-authorized", "Socket connection timeout", "rate-overlimit"];
    if (ignoreErrors.some(ignore => e.includes(ignore))) return;
    console.error('Uncaught Exception:', err);
});

export default router;