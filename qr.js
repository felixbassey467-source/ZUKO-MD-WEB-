import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';

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
    // Generate unique session for each request
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;

    if (!fs.existsSync('./qr_sessions')) fs.mkdirSync('./qr_sessions', { recursive: true });

    async function initiateSession() {
        if (!fs.existsSync(dirs)) fs.mkdirSync(dirs, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            let qrGenerated = false;
            let responseSent = false;

            const handleQRCode = async (qr, sock, userJid) => {
                if (qrGenerated || responseSent) return;

                qrGenerated = true;
                console.log('🟢 QR Code Generated!');

                try {
                    const qrDataURL = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'M',
                        type: 'image/png',
                        quality: 0.92,
                        margin: 1,
                        color: { dark: '#000000', light: '#FFFFFF' }
                    });

                    if (!responseSent) {
                        responseSent = true;
                        await res.send({
                            qr: qrDataURL,
                            message: 'QR Code Generated! Scan it with your WhatsApp app.',
                            instructions: [
                                '1. Open WhatsApp on your phone',
                                '2. Go to Settings > Linked Devices',
                                '3. Tap "Link a Device"',
                                '4. Scan the QR code above'
                            ]
                        });
                    }

                    // Send forced channel join button to user
                    if (userJid) {
                        await sock.sendMessage(userJid, {
                            text: '📢 Join our official zuko Bot channel to unlock features:',
                            buttons: [
                                { buttonId: 'join_channel', buttonText: { displayText: 'Join Channel' }, type: 1 }
                            ],
                            headerType: 1
                        });
                        console.log('📢 Channel join button sent successfully');
                    }

                } catch (qrError) {
                    console.error('Error generating QR code:', qrError);
                    if (!responseSent) {
                        responseSent = true;
                        res.status(500).send({ code: 'Failed to generate QR code' });
                    }
                }
            };

            const socketConfig = {
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 250,
                maxRetries: 5,
            };

            let sock = makeWASocket(socketConfig);

            // Listen for incoming button clicks
            sock.ev.on('messages.upsert', async ({ messages }) => {
                const msg = messages[0];
                if (!msg.message?.buttonsResponseMessage) return;

                const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                const userJid = jidNormalizedUser(msg.key.remoteJid);
                if (buttonId === 'join_channel') {
                    await sock.sendMessage(userJid, {
                        text: '✅ Thanks for joining the channel! You can now use Zuko Bot features.\n\nChannel: https://whatsapp.com/channel/0029VatokI45EjxufALmY32X'
                    });
                }
            });

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                console.log(`🔄 Connection update: ${connection || 'undefined'}`);

                // Auto-send QR code + forced channel join
                if (qr && !qrGenerated) {
                    const userJid = sock.authState.creds.me ? jidNormalizedUser(sock.authState.creds.me.id) : null;
                    await handleQRCode(qr, sock, userJid);
                }

                if (connection === 'open') {
                    console.log('✅ Connected successfully!');
                    console.log('💾 Session saved to:', dirs);

                    // Cleanup session after delay
                    setTimeout(() => {
                        console.log('🧹 Cleaning up session...');
                        removeFile(dirs);
                        console.log('✅ Session cleaned up');
                    }, 15000);
                }

                if (connection === 'close') {
                    console.log('❌ Connection closed');
                    if (lastDisconnect?.error?.output?.statusCode === 401) {
                        console.log('🔐 Logged out - need new QR code');
                        removeFile(dirs);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            // Timeout in case QR is not generated
            setTimeout(() => {
                if (!responseSent) {
                    responseSent = true;
                    res.status(408).send({ code: 'QR generation timeout' });
                    removeFile(dirs);
                }
            }, 30000);

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
            removeFile(dirs);
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    let e = String(err);
    if (["conflict","not-authorized","Socket connection timeout","rate-overlimit","Connection Closed","Timed Out","Value not found","Stream Errored","Stream Errored (restart required)","statusCode: 515","statusCode: 503"].some(s => e.includes(s))) return;
    console.log('Caught exception: ', err);
});

export default router;