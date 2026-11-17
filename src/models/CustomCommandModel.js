/**
 * ASTEN! (ASISTEN TENAGA!) - Custom Command & Payment Alias Model
 */

const db = require('../database/db');
const { DEFAULT_COMMANDS } = require('../config/constants');

const CustomCommandModel = {
  // --- Custom Command Replies (/rules, /info, /halo) ---

  createReply: ({ botId, command, replyText, mediaUrl = null, creatorTelegramId }) => {
    const cmd = command.trim().toLowerCase();
    
    // Validation
    if (!cmd.startsWith('/')) {
      return { success: false, message: 'Command harus diawali karakter "/" (contoh: /info).' };
    }
    if (cmd.includes(' ')) {
      return { success: false, message: 'Command tidak boleh mengandung spasi.' };
    }
    if (DEFAULT_COMMANDS.includes(cmd)) {
      return { success: false, message: `Command ${cmd} adalah command bawaan ASTEN! dan tidak boleh diubah.` };
    }

    const now = Date.now();
    try {
      const stmt = db.prepare(`
        INSERT INTO custom_command_replies (
          bot_id, command, reply_text, media_url, creator_telegram_id, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(bot_id, command) DO UPDATE SET
          reply_text = excluded.reply_text,
          media_url = excluded.media_url,
          is_active = 1,
          updated_at = excluded.updated_at
      `);

      stmt.run(String(botId), cmd, replyText, mediaUrl, String(creatorTelegramId), now, now);
      return { success: true, command: CustomCommandModel.findReply(botId, cmd) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  findReply: (botId, command) => {
    const cmd = command.trim().toLowerCase();
    return db.prepare('SELECT * FROM custom_command_replies WHERE bot_id = ? AND command = ?')
      .get(String(botId), cmd);
  },

  getAllRepliesByBotId: (botId) => {
    return db.prepare('SELECT * FROM custom_command_replies WHERE bot_id = ? ORDER BY command ASC')
      .all(String(botId));
  },

  toggleReplyActive: (id, isActive) => {
    return db.prepare('UPDATE custom_command_replies SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, Date.now(), id);
  },

  deleteReply: (id) => {
    return db.prepare('DELETE FROM custom_command_replies WHERE id = ?').run(id);
  },

  // --- Custom Command Reply Payment Aliases (/bayar, /tagih, /pay, /invoice) ---

  createPaymentAlias: ({ botId, alias, creatorTelegramId, groupId = null }) => {
    let cleanAlias = alias.trim().toLowerCase();
    if (!cleanAlias.startsWith('/')) {
      cleanAlias = `/${cleanAlias}`;
    }

    if (cleanAlias.includes(' ')) {
      return { success: false, message: 'Alias payment tidak boleh mengandung spasi.' };
    }

    if (DEFAULT_COMMANDS.includes(cleanAlias)) {
      return { success: false, message: `Alias ${cleanAlias} bentrok dengan command bawaan sistem ASTEN!.` };
    }

    const now = Date.now();
    try {
      const stmt = db.prepare(`
        INSERT INTO custom_command_payment_aliases (
          bot_id, alias, creator_telegram_id, group_id, is_active, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 0, ?, ?)
        ON CONFLICT(bot_id, alias) DO UPDATE SET
          is_active = 1,
          updated_at = excluded.updated_at
      `);

      stmt.run(String(botId), cleanAlias, String(creatorTelegramId), groupId ? String(groupId) : null, now, now);
      return { success: true, alias: CustomCommandModel.findPaymentAlias(botId, cleanAlias) };
    } catch (err) {
      return { success: false, message: err.message };
    }
  },

  findPaymentAlias: (botId, alias) => {
    const cleanAlias = alias.trim().toLowerCase();
    return db.prepare('SELECT * FROM custom_command_payment_aliases WHERE bot_id = ? AND alias = ?')
      .get(String(botId), cleanAlias);
  },

  getAllPaymentAliasesByBotId: (botId) => {
    return db.prepare('SELECT * FROM custom_command_payment_aliases WHERE bot_id = ? ORDER BY alias ASC')
      .all(String(botId));
  },

  incrementAliasUsage: (botId, alias) => {
    const cleanAlias = alias.trim().toLowerCase();
    db.prepare('UPDATE custom_command_payment_aliases SET usage_count = usage_count + 1, updated_at = ? WHERE bot_id = ? AND alias = ?')
      .run(Date.now(), String(botId), cleanAlias);
  },

  togglePaymentAliasActive: (id, isActive) => {
    return db.prepare('UPDATE custom_command_payment_aliases SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, Date.now(), id);
  },

  deletePaymentAlias: (id) => {
    return db.prepare('DELETE FROM custom_command_payment_aliases WHERE id = ?').run(id);
  }
};

module.exports = CustomCommandModel;
