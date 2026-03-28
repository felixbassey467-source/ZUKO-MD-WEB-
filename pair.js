import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { 
    makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    Browsers, 
    fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ code: "Number is required" });

    num = num.replace(/[^0-9]/g, '');
    const dirs = `./session_${num}`;
    await removeFile(dirs);

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        const { version } = await fetchLatestBaileysVersion();

        try {
            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                // FIX: Use an array for the browser to trigger the notification reliably
                browser: ["Ubuntu", "Chrome", "20.0.04"], 
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: true,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: true,
                markOnlineOnConnect: true
            });

            // Handle pairing code request
            if (!KnightBot.authState.creds.registered) {
                await delay(1500); // Small delay to let the socket stabilize
                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        res.send({ code });
                    }
                } catch (error) {
                    console.error('Pairing Error:', error);
                    if (!res.headersSent) res.status(500).send({ code: "Service Error" });
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log("✅ Connected!");
                    await delay(5000);
                    const sessionPath = `${dirs}/creds.json`;
                    
                    if (fs.existsSync(sessionPath)) {
                        const sessionFile = fs.readFileSync(sessionPath);
                        const userJid = KnightBot.user.id.split(':')[0] + '@s.whatsapp.net';

                        // Send the file to the user
                        await KnightBot.sendMessage(userJid, { 
                            document: sessionFile, 
                            mimetype: 'application/json', 
                            fileName: 'creds.json' 
                        });

                        await KnightBot.sendMessage(userJid, { text: "✅ *ZUKO-MD LINKED SUCCESSFULLY*\n\nYour session file is above. Keep it safe." });
                    }
                    
                    // Cleanup
                    await delay(2000);
                    removeFile(dirs);
                }

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                    if (shouldReconnect) initiateSession();
                }
            });

        } catch (err) {
            console.error('Init Error:', err);
            removeFile(dirs);
        }
    }

    await initiateSession();
});

export default router;