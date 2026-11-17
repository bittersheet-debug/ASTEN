/**
 * ASTEN! (ASISTEN TENAGA!) - Database Initialization (Native SQLite DatabaseSync)
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config/config');

// Ensure database directory exists
const dbDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Ensure uploads directories exist
[config.UPLOAD_DIR, config.QRIS_DIR, config.PRODUCTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Open SQLite database connection
const db = new DatabaseSync(config.DB_PATH);

// Enable WAL mode & foreign keys for high reliability and concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);

// Migration: ensure is_official column exists on bots table
try {
  const cols = db.prepare('PRAGMA table_info(bots)').all().map(c => c.name);
  if (!cols.includes('is_official')) {
    db.exec('ALTER TABLE bots ADD COLUMN is_official INTEGER DEFAULT 0;');
  }
} catch (e) {
  // column already exists
}

console.log('[Database] ASTEN! Native SQLite Database initialized at:', config.DB_PATH);

module.exports = db;
