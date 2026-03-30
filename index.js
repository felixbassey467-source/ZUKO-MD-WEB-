import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';

// Importing the modules
import pairRouter from './pair.js';
import qrRouter from './qr.js';

const app = express();

// Resolve the current directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

// Increase max listeners limit
import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.use('/pair', pairRouter);
app.use('/qr', qrRouter);

app.listen(PORT, () => {
    console.log(`╔════════════════════════════════════════╗`);
    console.log(`║   🤖 Knight Bot - WhatsApp Linker     ║`);
    console.log(`╠════════════════════════════════════════╣`);
    console.log(`║ YouTube: @mr_unique_hacker            ║`);
    console.log(`║ GitHub: @mruniquehacker               ║`);
    console.log(`║                                        ║`);
    console.log(`║ Server running on:                     ║`);
    console.log(`║ http://localhost:${PORT}                 ║`);
    console.log(`╚════════════════════════════════════════╝`);
});

export default app;