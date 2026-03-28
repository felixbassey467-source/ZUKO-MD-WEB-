const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require("body-parser");

const PORT = process.env.PORT || 8000;

// Import routes
const qrRoute = require('./qr');
const pairRoute = require('./pair');

// Ensure temp directory exists
const fs = require('fs');
if (!fs.existsSync('./temp')) {
    fs.mkdirSync('./temp', { recursive: true });
}

// Increase max listeners
require('events').EventEmitter.defaultMaxListeners = 50;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use(express.static(__dirname));

// Routes
app.use('/qr', qrRoute);
app.use('/code', pairRoute);

// HTML pages
app.get('/pair', async (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/', async (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║        🔥 ZUKO-MD SERVER 🔥          ║
╠══════════════════════════════════════╣
║  ✅ Server is running                 ║
║  📡 Port: ${PORT}                       ║
║  🌐 URL: http://localhost:${PORT}      ║
╠══════════════════════════════════════╣
║  📱 Pairing Endpoints:                ║
║  • /code?number=123456789            ║
║  • /qr (QR Code)                     ║
║  • /pair (Web Interface)             ║
╠══════════════════════════════════════╣
║  ✨ ZUKO-MD Ready! ✨                 ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;