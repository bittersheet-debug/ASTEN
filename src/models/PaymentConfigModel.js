/**
 * ASTEN! (ASISTEN TENAGA!) - Payment Configuration Model
 */

const db = require('../database/db');

const PaymentConfigModel = {
  createOrUpdate: ({
    botId,
    ownerId,
    adminTelegramId = null,
    methodType, // EWALLET, BANK, QRIS
    methodName, // DANA, BCA, QRIS, etc.
    accountNumber = '',
    accountName = '',
    caption = '',
    qrisImagePath = null,
    fee = 0,
    isActive = 1
  }) => {
    const now = Date.now();

    // Check existing
    let existing;
    if (adminTelegramId) {
      existing = db.prepare(`
        SELECT * FROM payment_configs 
        WHERE bot_id = ? AND admin_telegram_id = ? AND method_name = ?
      `).get(String(botId), String(adminTelegramId), methodName);
    } else {
      existing = db.prepare(`
        SELECT * FROM payment_configs 
        WHERE bot_id = ? AND admin_telegram_id IS NULL AND method_name = ?
      `).get(String(botId), methodName);
    }

    if (existing) {
      db.prepare(`
        UPDATE payment_configs SET
          account_number = COALESCE(?, account_number),
          account_name = COALESCE(?, account_name),
          caption = COALESCE(?, caption),
          qris_image_path = COALESCE(?, qris_image_path),
          fee = COALESCE(?, fee),
          is_active = COALESCE(?, is_active),
          updated_at = ?
        WHERE id = ?
      `).run(
        accountNumber !== undefined ? accountNumber : null,
        accountName !== undefined ? accountName : null,
        caption !== undefined ? caption : null,
        qrisImagePath !== undefined ? qrisImagePath : null,
        fee !== undefined ? Number(fee) : null,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        now,
        existing.id
      );
      return PaymentConfigModel.findById(existing.id);
    }

    const stmt = db.prepare(`
      INSERT INTO payment_configs (
        bot_id, owner_id, admin_telegram_id, method_type, method_name,
        account_number, account_name, caption, qris_image_path, fee,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      String(botId),
      ownerId,
      adminTelegramId ? String(adminTelegramId) : null,
      methodType,
      methodName,
      accountNumber || '',
      accountName || '',
      caption || '',
      qrisImagePath || null,
      Number(fee || 0),
      isActive ? 1 : 0,
      now,
      now
    );

    return PaymentConfigModel.findById(result.lastInsertRowid);
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM payment_configs WHERE id = ?').get(id);
  },

  getAllByBotId: (botId, adminTelegramId = null) => {
    if (adminTelegramId) {
      // Return admin's payment methods combined or overridden
      return db.prepare(`
        SELECT * FROM payment_configs 
        WHERE bot_id = ? AND admin_telegram_id = ?
        ORDER BY method_type ASC, method_name ASC
      `).all(String(botId), String(adminTelegramId));
    }

    return db.prepare(`
      SELECT * FROM payment_configs 
      WHERE bot_id = ? AND admin_telegram_id IS NULL
      ORDER BY method_type ASC, method_name ASC
    `).all(String(botId));
  },

  getActivePaymentMethods: (botId, adminTelegramId = null) => {
    // Check if the specific admin has active payment methods
    if (adminTelegramId) {
      const adminMethods = db.prepare(`
        SELECT * FROM payment_configs 
        WHERE bot_id = ? AND admin_telegram_id = ? AND is_active = 1
        ORDER BY method_type ASC, method_name ASC
      `).all(String(botId), String(adminTelegramId));

      if (adminMethods.length > 0) {
        return adminMethods;
      }
    }

    // Fallback to bot default (Owner payment configs)
    return db.prepare(`
      SELECT * FROM payment_configs 
      WHERE bot_id = ? AND admin_telegram_id IS NULL AND is_active = 1
      ORDER BY method_type ASC, method_name ASC
    `).all(String(botId));
  },

  toggleActive: (id, isActive) => {
    return db.prepare('UPDATE payment_configs SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, Date.now(), id);
  },

  delete: (id) => {
    return db.prepare('DELETE FROM payment_configs WHERE id = ?').run(id);
  }
};

module.exports = PaymentConfigModel;
