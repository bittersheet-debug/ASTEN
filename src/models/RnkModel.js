/**
 * ASTEN! (ASISTEN TENAGA!) - RNK (Rating & Kritik) Model
 */

const db = require('../database/db');
const { RNK_STATUS, RNK_ACTIVATION_STATUS, DEFAULT_RNK_CAPTION } = require('../config/constants');

const RnkModel = {
  // --- RNK Configuration ---

  getConfig: (botId) => {
    let config = db.prepare('SELECT * FROM rnk_configs WHERE bot_id = ?').get(String(botId));
    if (!config) {
      // Create default
      const now = Date.now();
      db.prepare(`
        INSERT INTO rnk_configs (bot_id, caption, link_rnk, group_comment_id, status, updated_at)
        VALUES (?, ?, '', '', ?, ?)
      `).run(String(botId), DEFAULT_RNK_CAPTION, RNK_ACTIVATION_STATUS.BELUM_AKTIF, now);
      config = db.prepare('SELECT * FROM rnk_configs WHERE bot_id = ?').get(String(botId));
    }
    return config;
  },

  updateConfig: (botId, { caption, linkRnk, groupCommentId, status }) => {
    const now = Date.now();
    // Ensure row exists
    RnkModel.getConfig(botId);

    db.prepare(`
      UPDATE rnk_configs SET
        caption = COALESCE(?, caption),
        link_rnk = COALESCE(?, link_rnk),
        group_comment_id = COALESCE(?, group_comment_id),
        status = COALESCE(?, status),
        updated_at = ?
      WHERE bot_id = ?
    `).run(
      caption !== undefined ? caption : null,
      linkRnk !== undefined ? linkRnk : null,
      groupCommentId !== undefined ? String(groupCommentId) : null,
      status !== undefined ? status : null,
      now,
      String(botId)
    );

    return RnkModel.getConfig(botId);
  },

  // --- RNK Records & Mute Status ---

  createRecord: ({
    botId,
    transactionId,
    buyerId,
    buyerName = '',
    transactionGroupId,
    groupCommentId,
    adminTelegramId,
    caption,
    linkRnk
  }) => {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO rnk_records (
        bot_id, transaction_id, buyer_id, buyer_name,
        transaction_group_id, group_comment_id, admin_telegram_id,
        caption, link_rnk, requested_at, status, is_muted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const result = stmt.run(
      String(botId),
      String(transactionId),
      String(buyerId),
      buyerName || '',
      String(transactionGroupId),
      String(groupCommentId),
      String(adminTelegramId),
      caption,
      linkRnk,
      now,
      RNK_STATUS.WAITING,
      now
    );

    return db.prepare('SELECT * FROM rnk_records WHERE id = ?').get(result.lastInsertRowid);
  },

  findPendingByBuyerId: (botId, buyerId) => {
    return db.prepare(`
      SELECT * FROM rnk_records 
      WHERE bot_id = ? AND buyer_id = ? AND status = 'WAITING'
      ORDER BY requested_at DESC LIMIT 1
    `).get(String(botId), String(buyerId));
  },

  findPendingByBuyerAndCommentGroup: (botId, buyerId, groupCommentId) => {
    return db.prepare(`
      SELECT * FROM rnk_records 
      WHERE bot_id = ? AND buyer_id = ? AND group_comment_id = ? AND status = 'WAITING'
      ORDER BY requested_at DESC LIMIT 1
    `).get(String(botId), String(buyerId), String(groupCommentId));
  },

  completeRecord: (recordId, reviewContent = '') => {
    const now = Date.now();
    db.prepare(`
      UPDATE rnk_records SET
        status = ?,
        submitted_at = ?,
        is_muted = 0,
        unmuted_at = ?,
        review_content = ?
      WHERE id = ?
    `).run(RNK_STATUS.COMPLETED, now, now, reviewContent, recordId);

    return db.prepare('SELECT * FROM rnk_records WHERE id = ?').get(recordId);
  },

  markUnmuted: (recordId) => {
    return db.prepare('UPDATE rnk_records SET is_muted = 0, unmuted_at = ? WHERE id = ?')
      .run(Date.now(), recordId);
  },

  getAllRecordsByBotId: (botId, limit = 100) => {
    return db.prepare(`
      SELECT * FROM rnk_records 
      WHERE bot_id = ? 
      ORDER BY created_at DESC LIMIT ?
    `).all(String(botId), limit);
  },

  getStats: (botId) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM rnk_records WHERE bot_id = ?').get(String(botId)).count;
    const waiting = db.prepare("SELECT COUNT(*) as count FROM rnk_records WHERE bot_id = ? AND status = 'WAITING'").get(String(botId)).count;
    const completed = db.prepare("SELECT COUNT(*) as count FROM rnk_records WHERE bot_id = ? AND status = 'COMPLETED'").get(String(botId)).count;
    return { total, waiting, completed };
  }
};

module.exports = RnkModel;
