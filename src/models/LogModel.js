/**
 * ASTEN! (ASISTEN TENAGA!) - Activity Log Model
 */

const db = require('../database/db');

const LogModel = {
  log: ({ botId = null, ownerId = null, actorType = 'SYSTEM', actorId = 'SYSTEM', action, details = '' }) => {
    const now = Date.now();
    const detailString = typeof details === 'object' ? JSON.stringify(details) : String(details);

    try {
      db.prepare(`
        INSERT INTO activity_logs (bot_id, owner_id, actor_type, actor_id, action, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        botId ? String(botId) : null,
        ownerId ? parseInt(ownerId, 10) : null,
        actorType,
        String(actorId),
        action,
        detailString,
        now
      );
    } catch (err) {
      console.error('[LogModel] Error recording log:', err.message);
    }
  },

  getByBotId: (botId, limit = 100) => {
    return db.prepare(`
      SELECT * FROM activity_logs 
      WHERE bot_id = ? 
      ORDER BY created_at DESC LIMIT ?
    `).all(String(botId), limit);
  },

  getAll: (limit = 200) => {
    return db.prepare(`
      SELECT l.*, b.bot_name, b.bot_username 
      FROM activity_logs l
      LEFT JOIN bots b ON l.bot_id = b.bot_id
      ORDER BY l.created_at DESC LIMIT ?
    `).all(limit);
  }
};

module.exports = LogModel;
