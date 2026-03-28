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
}

// Function to remove files/directories
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    
    // Validate input
    if (!num) {
        return res.status(400).json({
            success: false,
            error: 'MISSING_NUMBER',
            message: 'Phone number is required'
        });
    }
    
    // Create unique session directory with timestamp to avoid conflicts
    const sessionId = Date.now();
    const dirs = `./sessions/session_${sessionId}`;
    
    // Clean the phone number - remove any non-digit characters
    let cleanNum = num.replace(/[^0-9]/g, '');
    
    // Validate the phone number
    const phone = pn('+' + cleanNum);
    if (!phone.isValid()) {
        return res.status(400).json({
            success: false,
            error: 'INVALID_NUMBER',
            message: 'Invalid phone number. Please enter your full international number (e.g., 2349079055953 for Nigeria)',
            hint: 'Include country code without the + symbol'
        });
    }
    
    // Use the international number format (E.164, without '+')
    const internationalNum = phone.getNumber('e164').replace('+', '');
    let pairingCode = null;
    let responseSent = false;
    let sessionActive = true;
    
    console.log(`📱 Processing pairing request for: +${internationalNum}`);

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();
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
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            });

            // Handle connection updates
            ZukoBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin } = update;

                // When connection is established, send WhatsApp notifications
                if (connection === 'open' && sessionActive) {
                    console.log("✅ WhatsApp connection established!");
                    
                    try {
                        const userJid = jidNormalizedUser(internationalNum + '@s.whatsapp.net');
                        
                        // CRITICAL: Send the pairing code via WhatsApp first
                        if (pairingCode) {
                            console.log(`📤 Sending pairing code ${pairingCode} to WhatsApp...`);
                            await ZukoBot.sendMessage(userJid, {
                                text: `🔐 *ZUKO-MD Pairing Code*\n\nYour 8-digit pairing code: *${pairingCode}*\n\n⚠️ *Do not share this code with anyone!*\n\nUse this code to link your WhatsApp device in the WhatsApp Web settings.\n\n📢 Join our channel: ${CHANNEL_LINK}`
                            });
                            console.log("✅ Pairing code sent via WhatsApp!");
                        }
                        
                        // Send session file
                        if (fs.existsSync(dirs + '/creds.json')) {
                            const sessionKnight = fs.readFileSync(dirs + '/creds.json');
                            await ZukoBot.sendMessage(userJid, {
                                document: sessionKnight,
                                mimetype: 'application/json',
                                fileName: 'creds.json',
                                caption: '📱 *ZUKO-MD Session File*\n\nSave this file securely. It contains your WhatsApp authentication data.'
                            });
                            console.log("📄 Session file sent successfully");
                        }
                        
                        // Send channel invitation
                        await ZukoBot.sendMessage(userJid, {
                            text: `📢 *Join ZUKO-MD Official Channel*\n\n${CHANNEL_LINK}\n\n✨ Get updates\n🛠️ Support\n🎉 Latest features\n\nThank you for using ZUKO-MD!`
                        });
                        console.log("✅ Channel invitation sent");
                        
                        // Clean up session after delay
                        await delay(3000);
                        if (sessionActive) {
                            removeFile(dirs);
                            console.log("🧹 Session cleaned up");
                        }
                        
                    } catch (error) {
                        console.error("❌ Error sending WhatsApp messages:", error);
                    }
                    
                    sessionActive = false;
                }

                if (isNewLogin) {
                    console.log("🔐 New login via pair code");
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp");
                    } else if (sessionActive) {
                        console.log("🔄 Connection closed, attempting cleanup...");
                        removeFile(dirs);
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
                    
                    // Send response immediately
                    if (!responseSent) {
                        responseSent = true;
                        res.json({
                            success: true,
                            code: pairingCode,
                            phone: '+' + internationalNum,
                            message: 'Pairing code generated! Check your WhatsApp for the code notification.',
                            whatsapp_status: 'notification_sent',
                            channel_link: CHANNEL_LINK
                        });
                    }
                    
                    // Wait for connection to establish and send WhatsApp notifications
                    // The connection.update handler will send the code via WhatsApp when connected
                    
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
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
            
            // Auto cleanup after 30 seconds if session still active
            setTimeout(() => {
                if (sessionActive) {
                    console.log("⏰ Session timeout, cleaning up...");
                    removeFile(dirs);
                    sessionActive = false;
                }
            }, 30000);
            
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!responseSent) {
                responseSent = true;
                res.status(503).json({
                    success: false,
                    error: 'SERVICE_UNAVAILABLE',
                    message: 'Service temporarily unavailable. Please try again.'
                });
            }
            removeFile(dirs);
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    const ignoreErrors = [
        "conflict", "not-authorized", "Socket connection timeout", 
        "rate-overlimit", "Connection Closed", "Timed Out", 
        "Value not found", "Stream Errored", "statusCode: 515", "statusCode: 503"
    ];
    
    if (ignoreErrors.some(ignore => e.includes(ignore))) {
        return;
    }
    console.error('Uncaught Exception:', err);
});

export default router;