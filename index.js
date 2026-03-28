import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import cors from 'cors';

// Import routers
import pairRouter from './pair.js';
import qrRouter from './qr.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// API Routes
app.use('/pair', pairRouter);
app.use('/qr', qrRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Endpoint not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong on the server'
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════╗
║     ZUKO-MD WhatsApp Pairing System     ║
╠════════════════════════════════════════╣
║  Server running on:                    ║
║  http://localhost:${PORT}              ║
║  http://127.0.0.1:${PORT}              ║
╠════════════════════════════════════════╣
║  Ready to accept pairing requests!     ║
╚════════════════════════════════════════╝
    `);
});

export default app;