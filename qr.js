const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')
const {makeid} = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
	default: ZUKO_MD_Client,
	useMultiFileAuthState,
	jidNormalizedUser,
	Browsers,
	delay,
	makeInMemoryStore,
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
	if (!fs.existsSync(FilePath)) return false;
	fs.rmSync(FilePath, {
		recursive: true,
		force: true
	})
};
const {
	readFile
} = require("node:fs/promises")
router.get('/', async (req, res) => {
	const id = makeid();
	async function ZUKO_MD_QR_CODE() {
		const {
			state,
			saveCreds
		} = await useMultiFileAuthState('./temp/' + id)
		try {
			let Qr_Code_By_ZUKO = ZUKO_MD_Client({
				auth: state,
				printQRInTerminal: false,
				logger: pino({
					level: "silent"
				}),
				browser: Browsers.macOS("Desktop"),
			});

			Qr_Code_By_ZUKO.ev.on('creds.update', saveCreds)
			Qr_Code_By_ZUKO.ev.on("connection.update", async (s) => {
				const {
					connection,
					lastDisconnect,
					qr
				} = s;
				if (qr) await res.end(await QRCode.toBuffer(qr));
				if (connection == "open") {
					await delay(5000);
					let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
					await delay(800);
				   let b64data = Buffer.from(data).toString('base64');
				   let session = await Qr_Code_By_ZUKO.sendMessage(Qr_Code_By_ZUKO.user.id, { text: '' + b64data });
	
				   // Simple clean output message for ZUKO-MD
				   let ZUKO_MD_TEXT = `
╔══════════════════════════════════════╗
║           ⚡ ZUKO-MD ⚡              ║
║      QR Code Scanned Successfully!    ║
╠══════════════════════════════════════╣
║  ✅ Bot is now connected              ║
║  🔐 Session credentials saved         ║
║  📱 Ready to use ZUKO-MD              ║
╠══════════════════════════════════════╣
║  📂 GitHub: Neggy5/ZUKO-MD           ║
║  💬 Group: https://chat.whatsapp.com/DdZI3H1EFeOJs9TCIyVyXa?mode=gi_t ║
║  👤 Support: wa.me/2349079055953    ║
╠══════════════════════════════════════╣
║  🚀 Deploy now & enjoy!               ║
║  ✨ Thanks for choosing ZUKO-MD ✨    ║
╚══════════════════════════════════════╝`;

				   await Qr_Code_By_ZUKO.sendMessage(Qr_Code_By_ZUKO.user.id, { text: ZUKO_MD_TEXT }, { quoted: session });

					await delay(100);
					await Qr_Code_By_ZUKO.ws.close();
					return await removeFile("temp/" + id);
				} else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
					await delay(10000);
					ZUKO_MD_QR_CODE();
				}
			});
		} catch (err) {
			if (!res.headersSent) {
				await res.json({
					code: "Service is Currently Unavailable"
				});
			}
			console.log(err);
			await removeFile("temp/" + id);
		}
	}
	return await ZUKO_MD_QR_CODE()
});
module.exports = router;