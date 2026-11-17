/**
 * ASTEN! (ASISTEN TENAGA!) - System Configuration
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'production',
  
  // Base URLs
  BASE_URL: process.env.BASE_URL || 'https://astendebugweb.vercel.app',
  
  // Security
  MASTER_KEY: process.env.MASTER_KEY || 'asten-super-secret-master-key-32b!', // 32 chars for AES
  JWT_SECRET: process.env.JWT_SECRET || 'asten-jwt-secret-key-2026',
  PORTAL_PASSWORD: process.env.PORTAL_PASSWORD || 'astenadmin2026',
  
  // Official System Bot
  OFFICIAL_BOT_TOKEN: process.env.OFFICIAL_BOT_TOKEN || '9167134826:AAGSgayQyJgt1JAvTzzJ_40vKWN2Y6rUmY4',

  // Paths & Vercel Serverless Compatibility
  DB_PATH: process.env.DB_PATH || (process.env.VERCEL ? path.join('/tmp', 'asten.db') : path.join(__dirname, '../../data/asten.db')),
  UPLOAD_DIR: process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '../../uploads'),
  QRIS_DIR: process.env.VERCEL ? path.join('/tmp', 'uploads/qris') : path.join(__dirname, '../../uploads/qris'),
  PRODUCTS_DIR: process.env.VERCEL ? path.join('/tmp', 'uploads/products') : path.join(__dirname, '../../uploads/products'),
  
  // Bot Workers
  POLLING_INTERVAL: parseInt(process.env.POLLING_INTERVAL || '1000', 10),
  EXPIRATION_WORKER_INTERVAL: 15000 // 15 seconds
};
