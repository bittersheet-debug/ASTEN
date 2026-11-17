/**
 * ASTEN! (ASISTEN TENAGA!) - Bot Model
 */

const db = require('../database/db');
const { encrypt, decrypt } = require('../security/encryption');
const { BOT_STATUS } = require('../config/constants');
const OwnerModel = require('./OwnerModel');
const TelegramService = require('../services/telegramService');

const BotModel = {
  create: ({ botId, ownerId, ownerTelegramId, botToken, botName, botUsername, isOfficial = 0, settings = {} }) => {
    const encryptedToken = encrypt(botToken);
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO bots (
        bot_id, owner_id, owner_telegram_id, bot_token_encrypted,
        bot_name, bot_username, status, is_official, settings_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      String(botId),
      ownerId,
      String(ownerTelegramId),
      encryptedToken,
      botName,
      botUsername,
      BOT_STATUS.ACTIVE,
      isOfficial ? 1 : 0,
      JSON.stringify(settings),
      now,
      now
    );

    return BotModel.findByBotId(botId);
  },

  findByBotId: (botId) => {
    if (!botId) return null;
    const bot = db.prepare('SELECT * FROM bots WHERE bot_id = ?').get(String(botId));
    if (!bot) return null;
    return {
      ...bot,
      bot_token: decrypt(bot.bot_token_encrypted),
      settings: JSON.parse(bot.settings_json || '{}')
    };
  },

  findByOwnerId: (ownerId) => {
    const bots = db.prepare('SELECT * FROM bots WHERE owner_id = ?').all(ownerId);
    return bots.map(b => ({
      ...b,
      bot_token: decrypt(b.bot_token_encrypted),
      settings: JSON.parse(b.settings_json || '{}')
    }));
  },

  /**
   * Count tenant bots only (official bot does NOT count against owner's quota - "ga kehitung")
   */
  countTenantBotsByOwnerId: (ownerId) => {
    return db.prepare('SELECT COUNT(*) as count FROM bots WHERE owner_id = ? AND (is_official = 0 OR is_official IS NULL)').get(ownerId).count;
  },

  findByOwnerTelegramId: (ownerTelegramId) => {
    const bots = db.prepare('SELECT * FROM bots WHERE owner_telegram_id = ?').all(String(ownerTelegramId));
    return bots.map(b => ({
      ...b,
      bot_token: decrypt(b.bot_token_encrypted),
      settings: JSON.parse(b.settings_json || '{}')
    }));
  },

  getAll: () => {
    const bots = db.prepare(`
      SELECT b.*, o.name as owner_name, o.license_type, o.status as owner_status, o.license_expires_at
      FROM bots b
      LEFT JOIN owners o ON b.owner_id = o.id
      ORDER BY b.is_official DESC, b.created_at DESC
    `).all();

    return bots.map(b => ({
      ...b,
      bot_token: decrypt(b.bot_token_encrypted),
      settings: JSON.parse(b.settings_json || '{}')
    }));
  },

  getAllActive: () => {
    const bots = db.prepare(`
      SELECT b.*, o.status as owner_status, o.license_expires_at, o.license_type
      FROM bots b
      LEFT JOIN owners o ON b.owner_id = o.id
      WHERE b.status = 'ACTIVE' AND (b.is_official = 1 OR o.status = 'ACTIVE')
    `).all();

    return bots.map(b => ({
      ...b,
      bot_token: decrypt(b.bot_token_encrypted),
      settings: JSON.parse(b.settings_json || '{}')
    }));
  },

  getOfficialBot: () => {
    const bot = db.prepare('SELECT * FROM bots WHERE is_official = 1 LIMIT 1').get();
    if (!bot) return null;
    return {
      ...bot,
      bot_token: decrypt(bot.bot_token_encrypted),
      settings: JSON.parse(bot.settings_json || '{}')
    };
  },

  /**
   * Initialize / Register Official Bot ASTEN! (Permanen & Tidak terhitung kuota)
   */
  initOfficialBot: async (token) => {
    if (!token) return null;

    const validation = await TelegramService.validateToken(token);
    if (!validation.valid) {
      console.error('[BotModel] Official Bot token invalid:', validation.error);
      return null;
    }

    const tgBot = validation.bot;
    const botId = String(tgBot.id);

    // Ensure Master Official Owner exists
    let officialOwner = db.prepare("SELECT * FROM owners WHERE telegram_user_id = 'OFFICIAL_SYSTEM'").get();
    if (!officialOwner) {
      const now = Date.now();
      const res = db.prepare(`
        INSERT INTO owners (
          name, telegram_username, telegram_user_id, license_type, license_expires_at,
          max_bots, status, created_at, updated_at
        ) VALUES ('ASTEN! Official System', 'Astenobot', 'OFFICIAL_SYSTEM', 'PERMANENT', NULL, 999999, 'ACTIVE', ?, ?)
      `).run(now, now);
      officialOwner = OwnerModel.findById(res.lastInsertRowid);
    }

    // Check if official bot exists in DB
    const existing = db.prepare('SELECT * FROM bots WHERE bot_id = ?').get(botId);
    if (existing) {
      db.prepare(`
        UPDATE bots SET 
          is_official = 1,
          status = 'ACTIVE',
          owner_id = ?,
          owner_telegram_id = 'OFFICIAL_SYSTEM',
          bot_token_encrypted = ?,
          bot_name = ?,
          bot_username = ?,
          updated_at = ?
        WHERE bot_id = ?
      `).run(
        officialOwner.id,
        encrypt(token),
        tgBot.first_name,
        tgBot.username,
        Date.now(),
        botId
      );
    } else {
      BotModel.create({
        botId,
        ownerId: officialOwner.id,
        ownerTelegramId: 'OFFICIAL_SYSTEM',
        botToken: token,
        botName: tgBot.first_name,
        botUsername: tgBot.username,
        isOfficial: 1,
        settings: {
          isOfficialMaster: true,
          greeting: 'Selamat datang di Official Bot ASTEN! (ASISTEN TENAGA!)'
        }
      });
    }

    console.log(`[BotModel] ⭐ Official Bot ASTEN! @${tgBot.username} (ID: ${botId}) terdaftar PERMANEN.`);
    return BotModel.findByBotId(botId);
  },

  updateStatus: (botId, status) => {
    const operational = status === 'ACTIVE' ? 'ONLINE' : (status === 'INACTIVE' ? 'DISABLED' : 'OFFLINE');
    return db.prepare(`
      UPDATE bots SET 
        status = ?, 
        operational_status = ?, 
        connection_status = ?,
        updated_at = ? 
      WHERE bot_id = ?
    `).run(status, operational, operational === 'ONLINE' ? 'CONNECTED' : 'DISCONNECTED', Date.now(), String(botId));
  },

  updateOperationalStatus: (botId, operationalStatus, errorMessage = null) => {
    const conn = operationalStatus === 'ONLINE' ? 'CONNECTED' : (operationalStatus === 'CONNECTING' ? 'CONNECTING' : 'DISCONNECTED');
    return db.prepare(`
      UPDATE bots SET
        operational_status = ?,
        error_message = ?,
        connection_status = ?,
        last_health_check = ?,
        updated_at = ?
      WHERE bot_id = ?
    `).run(
      operationalStatus,
      errorMessage,
      conn,
      Date.now(),
      Date.now(),
      String(botId)
    );
  },

  updateHealthCheckTimestamp: (botId) => {
    return db.prepare(`
      UPDATE bots SET
        last_health_check = ?,
        operational_status = 'ONLINE',
        connection_status = 'CONNECTED'
      WHERE bot_id = ?
    `).run(Date.now(), String(botId));
  },

  incrementRestartCount: (botId) => {
    return db.prepare('UPDATE bots SET restart_count = restart_count + 1 WHERE bot_id = ?')
      .run(String(botId));
  },

  resetRestartCount: (botId) => {
    return db.prepare('UPDATE bots SET restart_count = 0 WHERE bot_id = ?')
      .run(String(botId));
  },

  updateSettings: (botId, settings) => {
    return db.prepare('UPDATE bots SET settings_json = ?, updated_at = ? WHERE bot_id = ?')
      .run(JSON.stringify(settings), Date.now(), String(botId));
  },

  delete: (botId) => {
    // Prevent deletion of official bot!
    const bot = BotModel.findByBotId(botId);
    if (bot && bot.is_official) {
      throw new Error('Bot Official ASTEN! bersifat PERMANEN dan tidak dapat dihapus.');
    }
    return db.prepare('DELETE FROM bots WHERE bot_id = ?').run(String(botId));
  },

  getStats: () => {
    // Exclude official bot from tenant quota counting, but provide overall stats
    const total = db.prepare("SELECT COUNT(*) as count FROM bots WHERE is_official = 0 OR is_official IS NULL").get().count;
    const allBots = db.prepare("SELECT COUNT(*) as count FROM bots").get().count;
    const active = db.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'ACTIVE' AND (is_official = 0 OR is_official IS NULL)").get().count;
    const inactive = db.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'INACTIVE' AND (is_official = 0 OR is_official IS NULL)").get().count;
    const online = db.prepare("SELECT COUNT(*) as count FROM bots WHERE operational_status = 'ONLINE'").get().count;
    const offline = db.prepare("SELECT COUNT(*) as count FROM bots WHERE operational_status = 'OFFLINE'").get().count;
    const error = db.prepare("SELECT COUNT(*) as count FROM bots WHERE operational_status = 'ERROR'").get().count;
    const validApi = db.prepare("SELECT COUNT(*) as count FROM bots WHERE api_status = 'VALID'").get().count;
    const officialCount = db.prepare("SELECT COUNT(*) as count FROM bots WHERE is_official = 1").get().count;
    return {
      total,
      allBots,
      active,
      inactive,
      online,
      offline,
      error,
      validApi,
      officialCount
    };
  }
};

module.exports = BotModel;
