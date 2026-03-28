import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// WhatsApp Channel Link
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VatokI45EjxufALmY32X';

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
    let dirs = './' + (num || `session`);

    // Remove existing session if present
    await removeFile(dirs);

    // Clean the phone number - remove any non-digit characters
    num = num.replace(/[^0-9]/g, '');

    // Validate the phone number
    const phone = pn('+' + num);
    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).json({
                success: false,
                error: 'INVALID_NUMBER',
                message: 'Invalid phone number. Please enter your full international number (e.g., 15551234567 for US, 447911123456 for UK) without + or spaces.',
                hint: 'Include country code without the + symbol'
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

            // Flag to track if we've sent the pairing code response
            let pairingCodeSent = false;

            ZukoBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log("✅ Connected successfully!");
                    console.log("📱 Sending session file to user...");
                    
                    try {
                        // Wait a bit for the connection to stabilize
                        await delay(2000);
                        
                        const sessionKnight = fs.readFileSync(dirs + '/creds.json');

                        // Send session file to user
                        const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                        await ZukoBot.sendMessage(userJid, {
                            document: sessionKnight,
                            mimetype: 'application/json',
                            fileName: 'creds.json'
                        });
                        console.log("📄 Session file sent successfully");

                        // Send channel invite message
                        await ZukoBot.sendMessage(userJid, {
                            text: `📢 *Join our official WhatsApp channel for updates:*\n${CHANNEL_LINK}\n\nStay updated with latest features and announcements!`
                        });
                        console.log("📢 Channel invite sent successfully");

                        // Send warning message
                        await ZukoBot.sendMessage(userJid, {
                            text: `⚠️ *IMPORTANT:* Do not share this file with anybody ⚠️\n\n┌┤✑  Thanks for using ZUKO-MD\n│└────────────┈ ⳹        \n│©2025 Mr Unique Hacker \n└─────────────────┈ ⳹`
                        });
                        console.log("⚠️ Warning message sent successfully");

                        // Clean up session after use
                        console.log("🧹 Cleaning up session...");
                        await delay(2000);
                        removeFile(dirs);
                        console.log("✅ Session cleaned up successfully");
                        console.log("🎉 Process completed successfully!");
                        
                        // Close the connection
                        await ZukoBot.logout();
                    } catch (error) {
                        console.error("❌ Error sending messages:", error);
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
                        console.log("🔁 Connection closed");
                    }
                }
            });

            // Request pairing code
            if (!ZukoBot.authState.creds.registered) {
                await delay(3000);
                num = num.replace(/[^\d+]/g, '');
                if (num.startsWith('+')) num = num.substring(1);

                try {
                    let code = await ZukoBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    if (!res.headersSent && !pairingCodeSent) {
                        pairingCodeSent = true;
                        console.log(`✅ Pairing code generated for ${num}: ${code}`);
                        
                        // Send pairing code response immediately
                        await res.json({
                            success: true,
                            code: code,
                            phone: '+' + num,
                            message: 'Pairing code generated successfully. Please enter this code in WhatsApp to link your device.',
                            channel: {
                                link: CHANNEL_LINK,
                                name: 'RAHMANI_MD UPDATES AND DEPLOYMENT',
                                description: 'Join for updates and latest features'
                            }
                        });
                        
                        // The bot will continue running in background to send session file after connection
                        console.log("⏳ Waiting for user to enter pairing code in WhatsApp...");
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent && !pairingCodeSent) {
                        pairingCodeSent = true;
                        res.status(503).json({
                            success: false,
                            error: 'PAIRING_FAILED',
                            message: 'Failed to generate pairing code. Please check your phone number and try again.'
                        });
                    }
                    removeFile(dirs);
                }
            }

            ZukoBot.ev.on('creds.update', saveCreds);
            
            // Set a timeout to cleanup if connection never completes
            setTimeout(() => {
                console.log("⏰ Session timeout - cleaning up...");
                removeFile(dirs);
            }, 120000); // 2 minute timeout
            
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
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
