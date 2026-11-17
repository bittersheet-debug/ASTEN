/**
 * ASTEN! (ASISTEN TENAGA!) - Vercel Serverless Entry Point
 */

const app = require('../src/api/server');
const BotModel = require('../src/models/BotModel');
const config = require('../src/config/config');

let isInitialized = false;

async function ensureVercelInit() {
  if (isInitialized) return;
  try {
    if (config.OFFICIAL_BOT_TOKEN) {
      await BotModel.initOfficialBot(config.OFFICIAL_BOT_TOKEN);
    }
    isInitialized = true;
  } catch (err) {
    console.error('[Vercel Init Notice]:', err.message);
  }
}

// Export Express app wrapped to ensure DB & Official Bot readiness on Vercel
module.exports = async (req, res) => {
  await ensureVercelInit();
  return app(req, res);
};
