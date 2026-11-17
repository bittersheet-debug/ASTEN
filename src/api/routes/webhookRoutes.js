/**
 * ASTEN! (ASISTEN TENAGA!) - Telegram Webhook Routes for Serverless Cloud (Vercel)
 * Enables Telegram bots to receive updates and reply 24/7 without needing localhost!
 */

const express = require('express');
const router = express.Router();
const BotModel = require('../../models/BotModel');
const { createBotInstance } = require('../../bot/botInstance');

// Cache bot instances in memory for serverless function reuse
const botInstancesCache = new Map();

function getOrCreateBot(botId) {
  let bot = botInstancesCache.get(String(botId));
  if (bot) return bot;

  const botRecord = BotModel.findByBotId(botId);
  if (!botRecord) return null;

  bot = createBotInstance(botRecord);
  botInstancesCache.set(String(botId), bot);
  return bot;
}

// POST /api/webhook/:botId - Telegram calls this on incoming updates
router.post('/:botId', async (req, res) => {
  const { botId } = req.params;

  try {
    const bot = getOrCreateBot(botId);
    if (!bot) {
      console.warn(`[Webhook] Update received for unknown bot ID: ${botId}`);
      return res.status(200).send('OK'); // Return 200 to prevent Telegram retry loop
    }

    // Process update through Telegraf pipeline
    await bot.handleUpdate(req.body, res);

    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  } catch (err) {
    console.error(`[Webhook Handler Error - Bot ${botId}]:`, err);
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  }
});

// GET /api/webhook/:botId - Status check
router.get('/:botId', (req, res) => {
  const { botId } = req.params;
  const botRecord = BotModel.findByBotId(botId);
  if (!botRecord) {
    return res.status(404).json({ success: false, message: 'Bot tidak ditemukan di database.' });
  }

  res.json({
    success: true,
    message: 'Webhook endpoint aktif',
    bot: {
      bot_id: botRecord.bot_id,
      bot_name: botRecord.bot_name,
      bot_username: botRecord.bot_username,
      is_official: botRecord.is_official === 1
    }
  });
});

module.exports = router;
