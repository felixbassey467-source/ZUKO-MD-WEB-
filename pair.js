import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { 
    makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';

const router = express.Router();

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) {
        fs.rmSync(FilePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ code: "Invalid Number" });

    // Clean number: Remove everything except digits
    num = num.replace(/[^0-9]/g, '');

    const sessionName = `session_${num}`;
    const dirs = `./${sessionName}`;

    // Clear old session
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
                // FIX 1: Use a manual browser array. This is the most compatible identity.
                browser: ["Ubuntu", "Chrome", "20.0.04"],
                // FIX 2: Added performance settings to stabilize connection
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 0,
            });

            // FIX 3: Wait until the socket is ready before requesting the code
            if (!KnightBot.authState.creds.registered) {
                await delay(2000); // 2 second delay for stability
                
                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    
                    if (!res.headersSent) {
                        console.log(`Pairing Code for ${num}: ${code}`);
                        res.send({ code });
                    }
                } catch (error) {
                    console.error('Error getting code:', error);
                    if (!res.headersSent) res.status(500).send({ code: "Service Unavailable" });
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log("✅ Successfully Linked!");
                    await delay(3000);
                    
                    const sessionFile = `${dirs}/creds.json`;
                    if (fs.existsSync(sessionFile)) {
                        const userJid = KnightBot.user.id.split(':')[0] + '@s.whatsapp.net';
                        
                        // Send creds.json to the user
                        await KnightBot.sendMessage(userJid, { 
                            document: fs.readFileSync(sessionFile), 
                            fileName: 'creds.json', 
                            mimetype: 'application/json' 
                        });

                        await KnightBot.sendMessage(userJid, { text: "🎉 *ZUKO-MD CONNECTED* \n\nSession file sent above." });
                    }

                    // Cleanup
                    await delay(2000);
                    removeFile(dirs);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) {
                        initiateSession();
                    } else {
                        removeFile(dirs);
                    }
                }
            });

        } catch (err) {
            console.error("Initialization error:", err);
            removeFile(dirs);
        }
    }

    await initiateSession();
});

export default router;
