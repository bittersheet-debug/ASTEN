/**
 * Set Telegram Webhook for all bots to https://astendebugweb.vercel.app
 */

const axios = require('axios');
const BotModel = require('../src/models/BotModel');
const config = require('../src/config/config');

async function setWebhooks() {
  const baseUrl = config.BASE_URL.replace(/\/$/, '');
  console.log(`🌐 Setting Telegram Webhooks to: ${baseUrl}/api/webhook/<botId>`);

  const bots = BotModel.getAll();
  console.log(`Found ${bots.length} bots in database.`);

  for (const bot of bots) {
    const webhookUrl = `${baseUrl}/api/webhook/${bot.bot_id}`;
    const token = bot.bot_token;

    try {
      console.log(`Setting webhook for @${bot.bot_username} (ID: ${bot.bot_id})...`);
      const res = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query', 'my_chat_member']
      });

      if (res.data && res.data.ok) {
        console.log(`✅ Webhook SUCCESS for @${bot.bot_username}: ${webhookUrl}`);
        BotModel.updateSettings(bot.bot_id, {
          ...bot.settings,
          webhook_url: webhookUrl
        });
      } else {
        console.warn(`⚠️ Telegram response not OK for @${bot.bot_username}:`, res.data);
      }
    } catch (err) {
      console.error(`❌ Error setting webhook for @${bot.bot_username}:`, err.response?.data || err.message);
    }
  }

  console.log('🎉 Webhook setup complete! Bots will now receive updates on Vercel.');
}

setWebhooks().catch(console.error);
