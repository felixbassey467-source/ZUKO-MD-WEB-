import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// Function to remove files or directories
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
    let dirs = './' + (num || `session_${Date.now()}`);

    // Remove existing session if present
    await removeFile(dirs);

    // Clean the phone number - remove any non-digit characters
    if (!num) {
        return res.status(400).send({ code: 'Phone number is required. Please provide a number parameter.' });
    }
    
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number using awesome-phonenumber
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ 
                code: 'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK, 84987654321 for Vietnam, etc.) without + or spaces.' 
            });
        }
        return;
    }
    // Use the international number format (E.164, without '+')
    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            let ZUKO = makeWASocket({
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

            ZUKO.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Sending session file to user...");
                    
                    try {
                        const sessionZuko = fs.readFileSync(dirs + '/creds.json');

                        // Get user JID
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        
                        // Send session file
                        await ZUKO.sendMessage(userJid, {
                            document: sessionZuko,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        });
                        console.log("📄 Session file sent successfully");

                        // Simple setup guide without YouTube link
                        await ZUKO.sendMessage(userJid, {
                            text: `🔥 *ZUKO-MD V2.0 Setup Complete!*\n\n╔══════════════════════════╗\n║  ✓ Session loaded       ║\n║  ✓ Bot is ready         ║\n║  ✓ Commands active      ║\n╚══════════════════════════╝\n\n⚡ *Features:*\n├─ AI Chat Assistant\n├─ Downloader Tools\n├─ Group Management\n└─ Auto Response\n\n💡 Type *!help* to see all commands`
                        });
                        console.log("✅ Setup guide sent successfully");

                        // Send warning message with clean design
                        await ZUKO.sendMessage(userJid, {
                            text: `⚠️ *CONFIDENTIAL* ⚠️\n\n┌──────────────────────┐\n│ Do not share this    │\n│ session file with    │\n│ anyone!              │\n└──────────────────────┘\n\n┌┤✑  ZUKO-MD Active\n│├─🔥 Honor • Power\n│└────────────┈ ⳹\n│©2025 ZUKO-MD\n└─────────────────┈ ⳹`
                        });
                        console.log("⚠️ Security warning sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(2000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        console.log("🎉 Process completed successfully!");
                        
                    } catch (error) {
                        console.error("❌ Error sending messages:", error);
                        // Still clean up session even if sending fails
                        removeFile(dirs);
                    }
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
                        console.log("🔁 Connection closed — restarting...");
                        // Only restart if not already cleaning up
                        if (!res.headersSent) {
                            initiateSession();
                        }
                    }
                }
            });

            // Request pairing code if not registered
            if (!ZUKO.authState.creds.registered) {
                await delay(3000); // Wait 3 seconds before requesting pairing code
                const cleanNum = num.replace(/[^\d+]/g, '');
                const finalNum = cleanNum.startsWith('+') ? cleanNum.substring(1) : cleanNum;

                try {
                    let code = await ZUKO.requestPairingCode(finalNum);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        console.log(`📱 Pairing code for ${num}: ${code}`);
                        await res.send({ code });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) {
                        res.status(503).send({ code: 'Failed to get pairing code. Please check your phone number and try again.' });
                    }
                    removeFile(dirs);
                }
            }

            ZUKO.ev.on('creds.update', saveCreds);
            
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
            removeFile(dirs);
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    let e = String(err);
    if (e.includes("conflict")) return;
    if (e.includes("not-authorized")) return;
    if (e.includes("Socket connection timeout")) return;
    if (e.includes("rate-overlimit")) return;
    if (e.includes("Connection Closed")) return;
    if (e.includes("Timed Out")) return;
    if (e.includes("Value not found")) return;
    if (e.includes("Stream Errored")) return;
    if (e.includes("Stream Errored (restart required)")) return;
    if (e.includes("statusCode: 515")) return;
    if (e.includes("statusCode: 503")) return;
    console.log('Caught exception: ', err);
});

export default router;