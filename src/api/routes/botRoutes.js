/**
 * ASTEN! (ASISTEN TENAGA!) - Bot Management API Routes
 */

const express = require('express');
const router = express.Router();
const BotModel = require('../../models/BotModel');
const botManager = require('../../bot/botManager');
const TelegramService = require('../../services/telegramService');

// Get all bots
router.get('/', (req, res) => {
  try {
    const bots = BotModel.getAll();
    const stats = BotModel.getStats();
    const live = botManager.getLiveStatus();
    res.json({ success: true, data: bots, stats, live });
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
    res.json({ success: true, message: `Bot @${botRecord.bot_username} berhasil dijalankan.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Stop bot
router.post('/:botId/stop', async (req, res) => {
  try {
    await botManager.stopBot(req.params.botId);
    BotModel.updateStatus(req.params.botId, 'INACTIVE');
    res.json({ success: true, message: 'Bot berhasil dihentikan.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Restart bot
router.post('/:botId/restart', async (req, res) => {
  try {
    await botManager.restartBot(req.params.botId);
    res.json({ success: true, message: 'Bot berhasil direstart.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete bot
router.delete('/:botId', async (req, res) => {
  try {
    await botManager.stopBot(req.params.botId);
    BotModel.delete(req.params.botId);
    res.json({ success: true, message: 'Bot berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
