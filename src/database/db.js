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

// Migration: ensure new columns exist on bots table
try {
  const cols = db.prepare('PRAGMA table_info(bots)').all().map(c => c.name);
  if (!cols.includes('is_official')) {
    db.exec('ALTER TABLE bots ADD COLUMN is_official INTEGER DEFAULT 0;');
  }
  if (!cols.includes('operational_status')) {
    db.exec("ALTER TABLE bots ADD COLUMN operational_status TEXT DEFAULT 'ONLINE';");
  }
  if (!cols.includes('api_status')) {
    db.exec("ALTER TABLE bots ADD COLUMN api_status TEXT DEFAULT 'VALID';");
  }
  if (!cols.includes('connection_status')) {
    db.exec("ALTER TABLE bots ADD COLUMN connection_status TEXT DEFAULT 'CONNECTED';");
  }
  if (!cols.includes('last_health_check')) {
    db.exec('ALTER TABLE bots ADD COLUMN last_health_check INTEGER;');
  }
  if (!cols.includes('error_message')) {
    db.exec('ALTER TABLE bots ADD COLUMN error_message TEXT;');
  }
  if (!cols.includes('restart_count')) {
    db.exec('ALTER TABLE bots ADD COLUMN restart_count INTEGER DEFAULT 0;');
  }
} catch (e) {
  // column already exists
}

console.log('[Database] ASTEN! Native SQLite Database initialized at:', config.DB_PATH);

module.exports = db;
