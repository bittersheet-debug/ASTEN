/**
 * ASTEN! (ASISTEN TENAGA!) - Express API & Web Portal Server
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('../config/config');

const authRoutes = require('./routes/authRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const licenseRoutes = require('./routes/licenseRoutes');
const botRoutes = require('./routes/botRoutes');
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const rnkRoutes = require('./routes/rnkRoutes');
const logsRoutes = require('./routes/logsRoutes');
const realtimeService = require('../services/realtimeService');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend for PORTAL PEMILIK BOT ASTEN!
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(config.UPLOAD_DIR));

// Real-Time Server-Sent Events (SSE) Stream
app.get('/api/events', (req, res) => {
  realtimeService.handleConnection(req, res);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/owners', ownerRoutes);
app.use('/api/licenses', licenseRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/products', productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/rnk', rnkRoutes);
app.use('/api/logs', logsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    app: 'ASTEN! (ASISTEN TENAGA!)',
    version: '2.5.0',
    timestamp: new Date().toISOString()
  });
});

// Fallback to portal SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
