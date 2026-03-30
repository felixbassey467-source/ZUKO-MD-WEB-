import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// Ensure the session directory exists
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
    
    if (!num) {
        return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Generate unique session ID to prevent conflicts
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./sessions/pair_${sessionId}`;
    
    // Create sessions directory if it doesn't exist
    if (!fs.existsSync('./sessions')) {
        fs.mkdirSync('./sessions', { recursive: true });
    }

    // Clean the phone number - remove any non-digit characters
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).json({ 
                error: 'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US) without + or spaces.' 
            });
        }
        return;
    }
    
    // Use the international number format (E.164, without '+')
    num = phone.getNumber('e164').replace('+', '');
    
    let responseSent = false;

    async function initiateSession() {
        try {
            // Create session directory
            if (!fs.existsSync(dirs)) {
                fs.mkdirSync(dirs, { recursive: true });
            }
            
            const { state, saveCreds } = await useMultiFileAuthState(dirs);

            const { version, isLatest } = await fetchLatestBaileysVersion();
            
            const KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS('Safari'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 3,
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Sending session file to user...");
                    
                    try {
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');

                        // Send session file to user
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await KnightBot.sendMessage(userJid, {
                            document: sessionKnight,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        });
                        console.log("📄 Session file sent successfully");

                        // Send video thumbnail with caption
                        await KnightBot.sendMessage(userJid, {
                            image: { url: 'https://img.youtube.com/vi/-oz_u1iMgf8/maxresdefault.jpg' },
                            caption: `🎬 *KnightBot MD V2.0 Full Setup Guide!*\n\n🚀 Bug Fixes + New Commands + Fast AI Chat\n📺 Watch Now: https://youtu.be/NjOipI2AoMk`
                        });
                        console.log("🎬 Video guide sent successfully");

                        // Send warning message
                        await KnightBot.sendMessage(userJid, {
                            text: `⚠️ Do not share this file with anybody ⚠️\n\n┌┤✑  Thanks for using Knight Bot\n│└────────────┈ ⳹        \n│©2025 Mr Unique Hacker \n└─────────────────┈ ⳹\n\n`
                        });
                        console.log("⚠️ Warning message sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(2000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        
                    } catch (error) {
                        console.error("❌ Error sending messages:", error);
                        removeFile(dirs);
                    }
                    
                    // Close the connection after sending
                    setTimeout(() => {
                        KnightBot.end();
                    }, 3000);
                }

                if (isNewLogin) {
                    console.log("🔐 New login via pair code");
                }

                if (isOnline) {
                    console.log("📶 Client is online");
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === 401) {
                        console.log("❌ Logged out from WhatsApp. Need to generate new pair code.");
                    } else {
                        console.log("🔁 Connection closed");
                    }
                }
            });

            // Request pairing code if not registered
            if (!KnightBot.authState.creds.registered) {
                await delay(2000);
                
                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    if (!responseSent && !res.headersSent) {
                        responseSent = true;
                        console.log(`📱 Pairing code for ${num}: ${code}`);
                        return res.json({ 
                            code: code,
                            success: true,
                            message: 'Pairing code generated successfully'
                        });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!responseSent && !res.headersSent) {
                        responseSent = true;
                        return res.status(503).json({ 
                            error: 'Failed to get pairing code. Please check your phone number and try again.' 
                        });
                    }
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);
            
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!responseSent && !res.headersSent) {
                responseSent = true;
                return res.status(503).json({ error: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
    
    // Set timeout to prevent hanging
    setTimeout(() => {
        if (!responseSent && !res.headersSent) {
            responseSent = true;
            res.status(408).json({ error: 'Request timeout' });
            removeFile(dirs);
        }
    }, 60000);
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    const ignoredErrors = [
        "conflict", "not-authorized", "Socket connection timeout",
        "rate-overlimit", "Connection Closed", "Timed Out",
        "Value not found", "Stream Errored", "statusCode: 515", "statusCode: 503"
    ];
    
    if (ignoredErrors.some(ignored => e.includes(ignored))) return;
    console.log('Caught exception: ', err);
});

export default router;