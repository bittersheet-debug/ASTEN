/**
 * ASTEN! (ASISTEN TENAGA!) - Admin Model
 */

const db = require('../database/db');
const { hashPassword } = require('../security/encryption');

const DEFAULT_PERMISSIONS = [
  'can_manage_products',
  'can_manage_stock',
  'can_create_payment',
  'can_verify_done',
  'can_manage_custom_replies',
  'can_manage_aliases',
  'can_view_reports',
  'can_manage_own_payment'
];

const AdminModel = {
  create: async ({ botId, ownerId, telegramUserId, name, username, password, permissions = DEFAULT_PERMISSIONS }) => {
    const passwordHash = await hashPassword(password);
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO admins (
        bot_id, owner_id, telegram_user_id, name, username,
        password_hash, permissions_json, is_active, is_payment_responsible,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
      ON CONFLICT(bot_id, telegram_user_id) DO UPDATE SET
        name = excluded.name,
        username = excluded.username,
        password_hash = excluded.password_hash,
        permissions_json = excluded.permissions_json,
        is_active = 1,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      String(botId),
      ownerId,
      String(telegramUserId),
      name,
      username || null,
      passwordHash,
      JSON.stringify(permissions),
      now,
      now
    );

    return AdminModel.findByTelegramUserId(botId, telegramUserId);
  },

  findByTelegramUserId: (botId, telegramUserId) => {
    if (!botId || !telegramUserId) return null;
    const admin = db.prepare('SELECT * FROM admins WHERE bot_id = ? AND telegram_user_id = ?')
      .get(String(botId), String(telegramUserId));
    if (!admin) return null;
    return {
      ...admin,
      permissions: JSON.parse(admin.permissions_json || '[]')
    };
  },

  getAllByBotId: (botId) => {
    const admins = db.prepare('SELECT * FROM admins WHERE bot_id = ? ORDER BY created_at ASC')
      .all(String(botId));
    return admins.map(a => ({
      ...a,
      permissions: JSON.parse(a.permissions_json || '[]')
    }));
  },

  updatePermissions: (botId, telegramUserId, permissions) => {
    return db.prepare('UPDATE admins SET permissions_json = ?, updated_at = ? WHERE bot_id = ? AND telegram_user_id = ?')
      .run(JSON.stringify(permissions), Date.now(), String(botId), String(telegramUserId));
  },

  updatePassword: async (botId, telegramUserId, newPassword) => {
    const passwordHash = await hashPassword(newPassword);
    return db.prepare('UPDATE admins SET password_hash = ?, updated_at = ? WHERE bot_id = ? AND telegram_user_id = ?')
      .run(passwordHash, Date.now(), String(botId), String(telegramUserId));
  },

  toggleActive: (botId, telegramUserId, isActive) => {
    return db.prepare('UPDATE admins SET is_active = ?, updated_at = ? WHERE bot_id = ? AND telegram_user_id = ?')
      .run(isActive ? 1 : 0, Date.now(), String(botId), String(telegramUserId));
  },

  setPaymentResponsible: (botId, telegramUserId, isResponsible) => {
    // If setting as responsible, optionally clear others for this bot
    if (isResponsible) {
      db.prepare('UPDATE admins SET is_payment_responsible = 0 WHERE bot_id = ?').run(String(botId));
    }
    return db.prepare('UPDATE admins SET is_payment_responsible = ?, updated_at = ? WHERE bot_id = ? AND telegram_user_id = ?')
      .run(isResponsible ? 1 : 0, Date.now(), String(botId), String(telegramUserId));
  },

  delete: (botId, telegramUserId) => {
    return db.prepare('DELETE FROM admins WHERE bot_id = ? AND telegram_user_id = ?')
      .run(String(botId), String(telegramUserId));
  },

  countByBotId: (botId) => {
    return db.prepare('SELECT COUNT(*) as count FROM admins WHERE bot_id = ? AND is_active = 1')
      .get(String(botId)).count;
  }
};

module.exports = AdminModel;
