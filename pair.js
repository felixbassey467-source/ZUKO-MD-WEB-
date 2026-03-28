const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')
const {makeid} = require('./id');
const express = require('express');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
    default: ZUKO_MD_Client,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    let pairingCodeSent = false;

    async function ZUKO_MD_PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            let Pair_Code_By_ZUKO = ZUKO_MD_Client({
                version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers("Chrome"),
            });

            Pair_Code_By_ZUKO.ev.on('creds.update', saveCreds);

            Pair_Code_By_ZUKO.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !pairingCodeSent && !Pair_Code_By_ZUKO.authState.creds.registered) {
                    pairingCodeSent = true;
                    try {
                        await delay(1500);
                        num = num.replace(/[^0-9]/g, '');
                        const code = await Pair_Code_By_ZUKO.requestPairingCode(num);
                        if (!res.headersSent) await res.send({ code });
                    } catch (e) {
                        console.log("Pairing code error:", e.message);
                        if (!res.headersSent) await res.send({ code: "Service is Currently Unavailable" });
                    }
                }

                if (connection == "open") {
                    await delay(50000);
                    let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    await delay(8000);
                    let b64data = Buffer.from(data).toString('base64');
                    let session = await Pair_Code_By_ZUKO.sendMessage(Pair_Code_By_ZUKO.user.id, { text: '' + b64data });

                    // Simple clean output message
                    let ZUKO_MD_TEXT = `
╔══════════════════════════════════════╗
║           🔥 ZUKO-MD 🔥              ║
║      Pairing Successfully Done!       ║
╠══════════════════════════════════════╣
║  ✅ Session saved successfully        ║
║  📱 Number: +${num}                   ║
║  🤖 Bot is now connected              ║
╠══════════════════════════════════════╣
║  📂 GitHub: Neggy5/ZUKO-MD           ║
║  💬 Group: https://chat.whatsapp.com/DdZI3H1EFeOJs9TCIyVyXa?mode=gi_t   ║
║  👤 Owner: wa.me/2349079055953    ║
╠══════════════════════════════════════╣
║  ✨ Thanks for using ZUKO-MD! ✨      ║
╚══════════════════════════════════════╝
`;

                    await Pair_Code_By_ZUKO.sendMessage(Pair_Code_By_ZUKO.user.id, { text: ZUKO_MD_TEXT }, { quoted: session });

                    await delay(100);
                    await Pair_Code_By_ZUKO.ws.close();
                    return await removeFile('./temp/' + id);

                } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode != 401) {
                    await delay(10000);
                    ZUKO_MD_PAIR_CODE();
                }
            });

        } catch (err) {
            console.log("service restarted");
            await removeFile('./temp/' + id);
            if (!res.headersSent) {
                await res.send({ code: "Service is Currently Unavailable" });
            }
        }
    }
    return await ZUKO_MD_PAIR_CODE();
});

module.exports = router;