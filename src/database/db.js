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

// Sync master asten.db to ephemeral environment (such as Vercel /tmp)
const bundledDbPath = path.resolve(__dirname, '../../data/asten.db');
const targetDbPath = path.resolve(config.DB_PATH);

if (targetDbPath !== bundledDbPath && fs.existsSync(bundledDbPath)) {
  const needsCopy = !fs.existsSync(targetDbPath) || fs.statSync(targetDbPath).size === 0;
  if (needsCopy) {
    try {
      fs.copyFileSync(bundledDbPath, targetDbPath);
      console.log(`[Database] Successfully synced master asten.db to ${targetDbPath}`);
    } catch (err) {
      console.warn(`[Database] Could not copy bundled database:`, err.message);
    }
  }
}

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

// Auto-seed initial data from data/seed.json if database is freshly created
try {
  const ownerCount = db.prepare('SELECT COUNT(*) as count FROM owners').get().count;
  if (ownerCount === 0) {
    const seedPath = path.resolve(__dirname, '../../data/seed.json');
    if (fs.existsSync(seedPath)) {
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

      // 1. Seed owners
      if (Array.isArray(seedData.owners) && seedData.owners.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO owners (id, name, telegram_username, telegram_user_id, password_hash, license_type, license_expires_at, max_bots, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const o of seedData.owners) {
          try {
            stmt.run(o.id, o.name, o.telegram_username, o.telegram_user_id, o.password_hash, o.license_type, o.license_expires_at, o.max_bots, o.status, o.created_at, o.updated_at);
          } catch (e) {}
        }
      }

      // 2. Seed access_codes
      if (Array.isArray(seedData.access_codes) && seedData.access_codes.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO access_codes (id, code, owner_name, telegram_username, telegram_user_id, license_type, duration_days, max_bots, status, notes, created_at, used_at, used_by_owner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const c of seedData.access_codes) {
          try {
            stmt.run(c.id, c.code, c.owner_name, c.telegram_username, c.telegram_user_id, c.license_type, c.duration_days, c.max_bots, c.status, c.notes, c.created_at, c.used_at, c.used_by_owner_id);
          } catch (e) {}
        }
      }

      // 3. Seed bots
      if (Array.isArray(seedData.bots) && seedData.bots.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO bots (id, bot_id, owner_id, owner_telegram_id, bot_token_encrypted, bot_name, bot_username, status, is_official, operational_status, api_status, connection_status, last_health_check, error_message, restart_count, webhook_url, settings_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const b of seedData.bots) {
          try {
            stmt.run(b.id, b.bot_id, b.owner_id, b.owner_telegram_id, b.bot_token_encrypted, b.bot_name, b.bot_username, b.status, b.is_official, b.operational_status, b.api_status, b.connection_status, b.last_health_check, b.error_message, b.restart_count, b.webhook_url, b.settings_json, b.created_at, b.updated_at);
          } catch (e) {}
        }
      }

      // 4. Seed rnk_configs
      if (Array.isArray(seedData.rnk_configs) && seedData.rnk_configs.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO rnk_configs (id, bot_id, group_comment_id, link_rnk, caption, auto_mute, min_review_chars, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of seedData.rnk_configs) {
          try {
            stmt.run(r.id, r.bot_id, r.group_comment_id, r.link_rnk, r.caption, r.auto_mute, r.min_review_chars, r.is_active, r.created_at, r.updated_at);
          } catch (e) {}
        }
      }

      // 5. Seed activity_logs
      if (Array.isArray(seedData.activity_logs) && seedData.activity_logs.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO activity_logs (id, bot_id, owner_id, actor_type, actor_id, action, details, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const l of seedData.activity_logs) {
          try {
            stmt.run(l.id, l.bot_id, l.owner_id, l.actor_type, l.actor_id, l.action, l.details, l.created_at);
          } catch (e) {}
        }
      }

      console.log('[Database] Seeded initial data from data/seed.json successfully');
    }
  }
} catch (err) {
  console.warn('[Database] Auto-seeding error:', err.message);
}

console.log('[Database] ASTEN! Native SQLite Database initialized at:', config.DB_PATH);

module.exports = db;
