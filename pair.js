const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
    return true;
}

// Ensure temp directory exists
if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
}

router.get('/', async (req, res) => {
    const id = makeid(8);
    let num = req.query.number;
    let pairingCodeSent = false;
    let responseSent = false;

    if (!num) {
        return res.status(400).send({ code: 'Phone number required' });
    }

    // Clean phone number
    num = num.replace(/[^0-9]/g, '');

    async function initiatePairing() {
        const sessionDir = path.join(__dirname, 'temp', id);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        try {
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
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
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    console.log("✅ Connected successfully!");
                    
                    try {
                        const userJid = sock.user.id;
                        const sessionData = fs.readFileSync(path.join(sessionDir, 'creds.json'));
                        const b64data = Buffer.from(sessionData).toString('base64');

                        // Send session file
                        const sessionMsg = await sock.sendMessage(userJid, {
                            document: sessionData,
                            mimetype: 'application/json',
                            fileName: 'zuko_creds.json'
                        });

                        // Send success message with clean design
                        await sock.sendMessage(userJid, {
                            text: `🔥 *ZUKO-MD V2.0 Connected!* 🔥\n\n╔════════════════════════════════╗\n║  ✓ Session loaded successfully ║\n║  ✓ Bot is now active           ║\n║  ✓ Multi-device ready          ║\n╚════════════════════════════════╝\n\n⚡ *Features Active:*\n├─ AI Chat Assistant\n├─ Media Downloader\n├─ Group Management\n├─ Auto Response\n└─ Anti-Spam System\n\n📱 *Phone:* +${num}\n💡 Type *!menu* to see all commands\n\n🔗 *Support:* wa.me/2349079055953`
                        });

                        await delay(1000);

                        // Send warning message
                        await sock.sendMessage(userJid, {
                            text: `⚠️ *SECURITY NOTICE* ⚠️\n\n┌──────────────────────────────┐\n│  DO NOT SHARE YOUR SESSION    │\n│  FILE WITH ANYONE!            │\n│  This file gives full access  │\n│  to your WhatsApp account.    │\n└──────────────────────────────┘\n\n┌┤✑  ZUKO-MD Active\n│├─🔥 Honor • Power • Precision\n│└────────────┈ ⳹\n│©2025 ZUKO-MD Team\n└─────────────────┈ ⳹\n\n*Keep this session safe!*`
                        });

                        console.log("📨 All messages sent successfully");
                        
                        await delay(3000);
                        await sock.ws.close();
                        removeFile(sessionDir);
                        
                    } catch (err) {
                        console.error("Error sending messages:", err);
                        removeFile(sessionDir);
                    }
                }

                if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) {
                        console.log("Connection closed, reconnecting...");
                        await delay(5000);
                        initiatePairing();
                    }
                }
            });

            // Request pairing code
            if (!sock.authState.creds.registered) {
                await delay(2000);
                try {
                    const code = await sock.requestPairingCode(num);
                    const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    if (!responseSent) {
                        responseSent = true;
                        console.log(`📱 Pairing code for ${num}: ${formattedCode}`);
                        await res.send({ code: formattedCode });
                    }
                } catch (err) {
                    console.error("Pairing error:", err);
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).send({ code: "Failed to generate pairing code. Check number and try again." });
                    }
                    removeFile(sessionDir);
                }
            }

        } catch (err) {
            console.error("Session error:", err);
            if (!responseSent) {
                responseSent = true;
                res.status(503).send({ code: "Service unavailable" });
            }
            removeFile(sessionDir);
        }
    }

    return await initiatePairing();
});

module.exports = router;