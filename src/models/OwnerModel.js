/**
 * ASTEN! (ASISTEN TENAGA!) - Owner Model
 */

const db = require('../database/db');
const { hashPassword } = require('../security/encryption');

const OwnerModel = {
  create: async ({ name, telegramUsername, telegramUserId, password, licenseType, durationDays, maxBots = 1 }) => {
    const now = Date.now();
    let licenseExpiresAt = null;
    
    if (licenseType !== 'PERMANENT' && durationDays > 0) {
      licenseExpiresAt = now + (durationDays * 24 * 60 * 60 * 1000);
    }

    const passwordHash = password ? await hashPassword(password) : null;

    const stmt = db.prepare(`
      INSERT INTO owners (
        name, telegram_username, telegram_user_id, password_hash,
        license_type, license_expires_at, max_bots, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    `);

    const result = stmt.run(
      name,
      telegramUsername || null,
      telegramUserId ? String(telegramUserId) : null,
      passwordHash,
      licenseType,
      licenseExpiresAt,
      maxBots,
      now,
      now
    );

    return OwnerModel.findById(result.lastInsertRowid);
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM owners WHERE id = ?').get(id);
  },

  findByTelegramUserId: (telegramUserId) => {
    if (!telegramUserId) return null;
    return db.prepare('SELECT * FROM owners WHERE telegram_user_id = ?').get(String(telegramUserId));
  },

  getAll: () => {
    return db.prepare(`
      SELECT o.*, 
        (SELECT COUNT(*) FROM bots b WHERE b.owner_id = o.id AND (b.is_official = 0 OR b.is_official IS NULL)) as bot_count 
      FROM owners o 
      WHERE o.telegram_user_id != 'OFFICIAL_SYSTEM'
      ORDER BY o.created_at DESC
    `).all();
  },

  updateStatus: (id, status) => {
    return db.prepare('UPDATE owners SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, Date.now(), id);
  },

  updateTelegramUserId: (id, telegramUserId, username = null) => {
    return db.prepare('UPDATE owners SET telegram_user_id = ?, telegram_username = ?, updated_at = ? WHERE id = ?')
      .run(String(telegramUserId), username, Date.now(), id);
  },

  updatePassword: async (id, newPassword) => {
    const passwordHash = await hashPassword(newPassword);
    return db.prepare('UPDATE owners SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, Date.now(), id);
  },

  extendLicense: (id, additionalDays) => {
    const owner = OwnerModel.findById(id);
    if (!owner) return null;
    
    const now = Date.now();
    let baseTime = owner.license_expires_at && owner.license_expires_at > now ? owner.license_expires_at : now;
    let newExpiresAt = baseTime + (additionalDays * 24 * 60 * 60 * 1000);

    db.prepare('UPDATE owners SET license_expires_at = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(newExpiresAt, 'ACTIVE', now, id);

    return OwnerModel.findById(id);
  },

  delete: (id) => {
    return db.prepare('DELETE FROM owners WHERE id = ?').run(id);
  }
};

module.exports = OwnerModel;
