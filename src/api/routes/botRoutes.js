/**
 * ASTEN! (ASISTEN TENAGA!) - Bot Management API Routes
 */

const express = require('express');
const router = express.Router();
const BotModel = require('../../models/BotModel');
const LogModel = require('../../models/LogModel');
const botManager = require('../../bot/botManager');
const TelegramService = require('../../services/telegramService');
const realtimeService = require('../../services/realtimeService');

// Get all bots (Tokens are completely stripped for security)
router.get('/', (req, res) => {
  try {
    const rawBots = BotModel.getAll();
    const safeBots = rawBots.map(b => {
      const { bot_token, bot_token_encrypted, ...safe } = b;
      return safe;
    });
    const stats = BotModel.getStats();
    const live = botManager.getLiveStatus();
    res.json({ success: true, data: safeBots, stats, live });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Validate Telegram Bot Token via getMe
router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token wajib diisi.' });

    const result = await TelegramService.validateToken(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Register and instantly launch new bot
router.post('/register', async (req, res) => {
  try {
    const { botToken, ownerTelegramId, ownerId } = req.body;
    if (!botToken) {
      return res.status(400).json({ success: false, message: 'API Token bot wajib diisi.' });
    }

    const result = await botManager.registerAndLaunchBot({
      botToken,
      ownerTelegramId,
      ownerId: ownerId ? parseInt(ownerId, 10) : null
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    realtimeService.broadcast('bot_updated', { action: 'REGISTER', bot: result.bot });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Start bot
router.post('/:botId/start', async (req, res) => {
  try {
    const botRecord = BotModel.findByBotId(req.params.botId);
    if (!botRecord) return res.status(404).json({ success: false, message: 'Bot tidak ditemukan.' });

    await botManager.startBot(botRecord);

    LogModel.log({
      botId: req.params.botId,
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'BOT_STARTED',
      details: `Bot @${botRecord.bot_username} (ID: ${req.params.botId}) berhasil dijalankan.`
    });

    realtimeService.broadcast('bot_updated', { action: 'START', botId: req.params.botId });
    res.json({ success: true, message: `Bot @${botRecord.bot_username} berhasil dijalankan.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stop bot
router.post('/:botId/stop', async (req, res) => {
  try {
    const botRecord = BotModel.findByBotId(req.params.botId);
    await botManager.stopBot(req.params.botId);
    BotModel.updateStatus(req.params.botId, 'INACTIVE');

    LogModel.log({
      botId: req.params.botId,
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'BOT_STOPPED',
      details: `Bot @${botRecord ? botRecord.bot_username : req.params.botId} dihentikan.`
    });

    realtimeService.broadcast('bot_updated', { action: 'STOP', botId: req.params.botId });
    res.json({ success: true, message: 'Bot berhasil dihentikan.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Restart bot
router.post('/:botId/restart', async (req, res) => {
  try {
    const botRecord = BotModel.findByBotId(req.params.botId);
    await botManager.restartBot(req.params.botId);

    LogModel.log({
      botId: req.params.botId,
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'BOT_RESTARTED',
      details: `Bot @${botRecord ? botRecord.bot_username : req.params.botId} berhasil direstart.`
    });

    realtimeService.broadcast('bot_updated', { action: 'RESTART', botId: req.params.botId });
    res.json({ success: true, message: 'Bot berhasil direstart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete bot
router.delete('/:botId', async (req, res) => {
  try {
    const botRecord = BotModel.findByBotId(req.params.botId);
    await botManager.stopBot(req.params.botId);
    BotModel.delete(req.params.botId);

    LogModel.log({
      botId: req.params.botId,
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'BOT_DELETED',
      details: `Bot @${botRecord ? botRecord.bot_username : req.params.botId} berhasil dihapus dari sistem ASTEN!.`
    });

    realtimeService.broadcast('bot_updated', { action: 'DELETE', botId: req.params.botId });
    res.json({ success: true, message: 'Bot berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
