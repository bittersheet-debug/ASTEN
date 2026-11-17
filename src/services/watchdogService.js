/**
 * ASTEN! (ASISTEN TENAGA!) - Watchdog & Auto-Restart / Auto-Reconnect Service
 * Continuously monitors all bots and automatically heals/restarts failed instances!
 */

const BotModel = require('../models/BotModel');
const TelegramService = require('./telegramService');
const RealtimeService = require('./realtimeService');
const LogModel = require('../models/LogModel');

let watchdogInterval = null;
const retryCounts = new Map(); // botId -> number of failed restart attempts

const WatchdogService = {
  start: () => {
    if (watchdogInterval) return;

    console.log('[WatchdogService] 🛡️ ASTEN! Watchdog & Auto-Recovery Process Manager started.');

    // Run health checks every 15 seconds
    watchdogInterval = setInterval(async () => {
      try {
        await WatchdogService.runHealthCheck();
      } catch (err) {
        console.error('[WatchdogService] Error during health check:', err.message);
      }
    }, 15000);
  },

  stop: () => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
      console.log('[WatchdogService] Watchdog stopped.');
    }
  },

  /**
   * Health check cycle
   */
  runHealthCheck: async () => {
    const botManager = require('../bot/botManager');
    const activeBots = BotModel.getAllActive();
    const now = Date.now();

    for (const botRecord of activeBots) {
      const botId = String(botRecord.bot_id);
      const isInstanceRunning = botManager.activeInstances.has(botId);

      // 1. If bot is marked ACTIVE in DB but NOT running in memory -> Auto-Restart!
      if (!isInstanceRunning && botRecord.status === 'ACTIVE') {
        const retries = retryCounts.get(botId) || 0;

        if (retries < 5) {
          console.warn(`[WatchdogService] ⚠️ Detected stopped bot: @${botRecord.bot_username} (ID: ${botId}). Initiating auto-restart attempt #${retries + 1}...`);

          // Update status to RESTARTING
          BotModel.updateOperationalStatus(botId, 'RESTARTING', 'Watchdog auto-reconnect initiated');
          RealtimeService.broadcast('bot_status_changed', {
            botId,
            status: 'RESTARTING',
            badge: '🔵 RESTARTING'
          });

          try {
            await botManager.startBot(botRecord);
            retryCounts.delete(botId);
            BotModel.updateOperationalStatus(botId, 'ONLINE', null);
            BotModel.resetRestartCount(botId);

            LogModel.log({
              botId,
              actorType: 'WATCHDOG',
              actorId: 'AUTO_RECOVERY',
              action: 'BOT_AUTO_RESTARTED',
              details: `Bot @${botRecord.bot_username} berhasil dipulihkan dan berjalan normal kembali.`
            });

            RealtimeService.broadcast('bot_status_changed', {
              botId,
              status: 'ONLINE',
              badge: '🟢 ONLINE'
            });
          } catch (err) {
            retryCounts.set(botId, retries + 1);
            BotModel.incrementRestartCount(botId);
            BotModel.updateOperationalStatus(botId, 'ERROR', err.message);

            LogModel.log({
              botId,
              actorType: 'WATCHDOG',
              actorId: 'AUTO_RECOVERY',
              action: 'BOT_RECOVERY_FAILED',
              details: `Gagal me-restart bot @${botRecord.bot_username}: ${err.message}`
            });

            RealtimeService.broadcast('bot_status_changed', {
              botId,
              status: 'ERROR',
              badge: '🟠 ERROR',
              error: err.message
            });
          }
        } else {
          // Exceeded 5 retries: mark ERROR
          BotModel.updateOperationalStatus(botId, 'ERROR', 'Gagal restart setelah 5 percobaan otomatis');
        }
      } else if (isInstanceRunning) {
        // Bot is running normally, update health check timestamp
        BotModel.updateHealthCheckTimestamp(botId);
      }
    }
  }
};

module.exports = WatchdogService;
