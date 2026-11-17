/**
 * ASTEN! (ASISTEN TENAGA!) - Multi-Bot Lifecycle Manager
 */

const BotModel = require('../models/BotModel');
const OwnerModel = require('../models/OwnerModel');
const TelegramService = require('../services/telegramService');
const { createBotInstance } = require('./botInstance');
const LogModel = require('../models/LogModel');
const config = require('../config/config');

class BotManager {
  constructor() {
    this.activeInstances = new Map(); // botId -> { bot, instance, startedAt }
  }

  /**
   * Start all active registered bots from the database
   */
  async startAllActiveBots() {
    console.log('[BotManager] Loading and starting all active ASTEN! bots...');

    // 1. Initialize and launch Official Master Bot (@Astenobot)
    if (config.OFFICIAL_BOT_TOKEN) {
      try {
        await BotModel.initOfficialBot(config.OFFICIAL_BOT_TOKEN);
      } catch (err) {
        console.error('[BotManager] Failed to initialize Official Bot:', err.message);
      }
    }

    const bots = BotModel.getAllActive();
    let startedCount = 0;

    for (const botRecord of bots) {
      try {
        await this.startBot(botRecord);
        startedCount++;
      } catch (err) {
        console.error(`[BotManager] Failed to start bot ${botRecord.bot_id} (${botRecord.bot_name}):`, err.message);
        BotModel.updateStatus(botRecord.bot_id, 'ERROR');
      }
    }

    console.log(`[BotManager] Successfully started ${startedCount}/${bots.length} active bots.`);
    return startedCount;
  }

  /**
   * Start a specific bot
   */
  async startBot(botRecord) {
    const botId = String(botRecord.bot_id);

    // Stop existing instance if already running
    if (this.activeInstances.has(botId)) {
      await this.stopBot(botId);
    }

    console.log(`[BotManager] Starting bot: @${botRecord.bot_username} (ID: ${botId})...`);

    // Verify token validity with Telegram Bot API
    const validation = await TelegramService.validateToken(botRecord.bot_token);
    if (!validation.valid) {
      throw new Error(`Token invalid for bot @${botRecord.bot_username}: ${validation.error}`);
    }

    const botInstance = createBotInstance(botRecord);

    // Launch bot via long-polling (or webhook)
    botInstance.launch({
      dropPendingUpdates: false,
      allowedUpdates: [
        'message',
        'edited_message',
        'callback_query',
        'my_chat_member',
        'chat_member'
      ]
    }).catch(err => {
      console.error(`[BotManager] Runtime error for bot ${botId}:`, err.message);
    });

    this.activeInstances.set(botId, {
      botRecord,
      instance: botInstance,
      startedAt: Date.now()
    });

    BotModel.updateStatus(botId, 'ACTIVE');

    console.log(`[BotManager] Bot @${botRecord.bot_username} is now RUNNING and ready!`);
    return true;
  }

  /**
   * Stop a running bot gracefully
   */
  async stopBot(botId) {
    const id = String(botId);
    const item = this.activeInstances.get(id);
    if (!item) return false;

    console.log(`[BotManager] Stopping bot ID: ${id}...`);
    try {
      await item.instance.stop('Bot stopped by ASTEN! BotManager');
    } catch (err) {
      // Ignore stop errors
    }

    this.activeInstances.delete(id);
    return true;
  }

  /**
   * Restart a bot
   */
  async restartBot(botId) {
    const botRecord = BotModel.findByBotId(botId);
    if (!botRecord) {
      throw new Error('Bot record not found in database');
    }
    await this.stopBot(botId);
    return this.startBot(botRecord);
  }

  /**
   * Register and instantly launch a new bot via BotFather API Token
   */
  async registerAndLaunchBot({ botToken, ownerTelegramId, ownerId = null }) {
    const cleanToken = botToken.trim();

    // 1. Validate token with Telegram getMe
    const validation = await TelegramService.validateToken(cleanToken);
    if (!validation.valid) {
      return { success: false, message: `Token BotFather tidak valid: ${validation.error}` };
    }

    const tgBot = validation.bot;
    const botId = String(tgBot.id);

    // 2. Check if already registered by another Owner
    const existing = BotModel.findByBotId(botId);
    if (existing) {
      if (existing.owner_id !== ownerId && String(existing.owner_telegram_id) !== String(ownerTelegramId)) {
        return { success: false, message: `Bot @${tgBot.username} sudah terdaftar pada Owner lain!` };
      }
    }

    // 3. Resolve Owner & verify license quota
    let owner;
    if (ownerId) {
      owner = OwnerModel.findById(ownerId);
    } else {
      owner = OwnerModel.findByTelegramUserId(ownerTelegramId);
    }

    if (!owner) {
      return { success: false, message: 'Owner tidak ditemukan. Silakan lakukan aktivasi kode akses terlebih dahulu.' };
    }

    if (owner.status !== 'ACTIVE') {
      return { success: false, message: 'Lisensi Owner ini berstatus tidak aktif atau telah kedaluwarsa.' };
    }

    // Check bot quota (Official bot does NOT count against owner quota - "ga kehitung"!)
    const currentTenantBotsCount = BotModel.countTenantBotsByOwnerId(owner.id);
    if (!existing && currentTenantBotsCount >= owner.max_bots) {
      return {
        success: false,
        message: `Kuota lisensi Anda telah tercapai (Maksimal: ${owner.max_bots} bot). Silakan upgrade lisensi di Portal ASTEN!.`
      };
    }

    // 4. Save to Database (encrypted token)
    let botRecord;
    if (existing) {
      BotModel.updateSettings(botId, existing.settings);
      botRecord = BotModel.findByBotId(botId);
    } else {
      botRecord = BotModel.create({
        botId,
        ownerId: owner.id,
        ownerTelegramId: owner.telegram_user_id || ownerTelegramId,
        botToken: cleanToken,
        botName: tgBot.first_name,
        botUsername: tgBot.username,
        settings: {
          greeting: `Selamat datang di ${tgBot.first_name}!`,
          currency: 'IDR'
        }
      });
    }

    LogModel.log({
      botId,
      ownerId: owner.id,
      actorType: 'OWNER',
      actorId: String(ownerTelegramId),
      action: 'BOT_REGISTERED',
      details: `Bot @${tgBot.username} (ID: ${botId}) berhasil didaftarkan dan dijalankan.`
    });

    // 5. Spin up and launch Telegraf instance immediately!
    await this.startBot(botRecord);

    return {
      success: true,
      message: `Selamat! Bot @${tgBot.username} berhasil didaftarkan dan langsung berjalan secara otomatis.`,
      bot: botRecord
    };
  }

  /**
   * Get live running status map
   */
  getLiveStatus() {
    const list = [];
    for (const [botId, info] of this.activeInstances.entries()) {
      list.push({
        bot_id: botId,
        bot_name: info.botRecord.bot_name,
        bot_username: info.botRecord.bot_username,
        is_official: info.botRecord.is_official ? 1 : 0,
        started_at: info.startedAt,
        uptime_seconds: Math.floor((Date.now() - info.startedAt) / 1000),
        status: 'RUNNING'
      });
    }
    return list;
  }
}

const botManagerInstance = new BotManager();
module.exports = botManagerInstance;
