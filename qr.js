const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
    return true;
}

router.get('/', async (req, res) => {
    const id = makeid(8);
    let responseSent = false;
    
    async function initiateQR() {
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
            });

            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (update) => {
                const { connection, qr } = update;
                
                if (qr && !responseSent) {
                    responseSent = true;
                    const qrBuffer = await QRCode.toBuffer(qr, {
                        width: 300,
                        margin: 2,
                        color: { dark: '#000000', light: '#FFFFFF' }
                    });
                    res.setHeader('Content-Type', 'image/png');
                    res.send(qrBuffer);
                }
                
                if (connection === "open") {
                    console.log("✅ QR Scanned - Connected!");
                    
                    try {
                        const userJid = sock.user.id;
                        const sessionData = fs.readFileSync(path.join(sessionDir, 'creds.json'));
                        
                        await sock.sendMessage(userJid, {
                            document: sessionData,
                            mimetype: 'application/json',
                            fileName: 'zuko_creds.json'
                        });
                        
                        await sock.sendMessage(userJid, {
                            text: `🔥 *ZUKO-MD Connected!* 🔥\n\n╔══════════════════════════╗\n║  ✓ QR Scanned Successfully║\n║  ✓ Bot is now active      ║\n║  ✓ Ready to use           ║\n╚══════════════════════════╝\n\n💡 Type *!menu* to start\n\n🔗 Support: wa.me/2349079055953`
                        });
                        
                        await delay(2000);
                        await sock.ws.close();
                        removeFile(sessionDir);
                        
                    } catch (err) {
                        console.error("Error:", err);
                        removeFile(sessionDir);
                    }
                }
            });
            
        } catch (err) {
            console.error("QR Error:", err);
            if (!responseSent) {
                res.status(503).send({ error: "Service unavailable" });
            }
            removeFile(sessionDir);
        }
    }
    
    return await initiateQR();
});

module.exports = router;