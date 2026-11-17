/**
 * ASTEN! (ASISTEN TENAGA!) - Security & Encryption Module
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

// Ensure key is exactly 32 bytes for aes-256-gcm
function getEncryptionKey() {
  return crypto.createHash('sha256').update(String(config.MASTER_KEY)).digest();
}

/**
 * Encrypt sensitive string (e.g., Telegram Bot Token)
 */
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12); // 12 bytes IV for GCM
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt sensitive string
 */
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Security] Decryption error:', err.message);
    return null;
  }
}

/**
 * Hash password with bcrypt and strong salt
 */
async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plainPassword, salt);
}

/**
 * Compare plain password with bcrypt hash
 */
async function comparePassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Generate cryptographically secure access code: ASTEN-XXXX-XXXX-XXXX
 */
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let segments = [];
  for (let s = 0; s < 3; s++) {
    let seg = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      seg += chars[bytes[i] % chars.length];
    }
    segments.push(seg);
  }
  return `ASTEN-${segments.join('-')}`;
}

/**
 * Generate unique transaction ID: AST-TX-YYYYMMDD-XXXX
 */
function generateTransactionId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `AST-TX-${y}${m}${d}-${rand}`;
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  comparePassword,
  generateAccessCode,
  generateTransactionId
};
