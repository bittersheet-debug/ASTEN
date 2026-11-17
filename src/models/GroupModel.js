/**
 * ASTEN! (ASISTEN TENAGA!) - Group Management Model
 */

const db = require('../database/db');
const { GROUP_STATUS } = require('../config/constants');

const GroupModel = {
  upsert: ({ botId, groupId, groupTitle = '', isAdmin = 0, permissions = {} }) => {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO groups (
        bot_id, group_id, group_title, is_active, is_admin, permissions_json, created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(bot_id, group_id) DO UPDATE SET
        group_title = COALESCE(?, group_title),
        is_active = 1,
        is_admin = excluded.is_admin,
        permissions_json = excluded.permissions_json,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      String(botId),
      String(groupId),
      groupTitle || '',
      isAdmin ? 1 : 0,
      JSON.stringify(permissions),
      now,
      now,
      groupTitle || null
    );

    return GroupModel.findByGroupId(botId, groupId);
  },

  findByGroupId: (botId, groupId) => {
    const group = db.prepare('SELECT * FROM groups WHERE bot_id = ? AND group_id = ?')
      .get(String(botId), String(groupId));
    if (!group) return null;
    return {
      ...group,
      permissions: JSON.parse(group.permissions_json || '{}')
    };
  },

  getAllByBotId: (botId) => {
    const groups = db.prepare('SELECT * FROM groups WHERE bot_id = ? ORDER BY updated_at DESC')
      .all(String(botId));
    return groups.map(g => ({
      ...g,
      permissions: JSON.parse(g.permissions_json || '{}')
    }));
  },

  setInactive: (botId, groupId) => {
    return db.prepare('UPDATE groups SET is_active = 0, is_admin = 0, updated_at = ? WHERE bot_id = ? AND group_id = ?')
      .run(Date.now(), String(botId), String(groupId));
  }
};

module.exports = GroupModel;
