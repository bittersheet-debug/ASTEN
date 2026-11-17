/**
 * ASTEN! (ASISTEN TENAGA!) - Main Server & Engine Bootstrap
 */

const http = require('http');
const config = require('./src/config/config');
const db = require('./src/database/db');
const botManager = require('./src/bot/botManager');
const expirationWorker = require('./src/services/expirationWorker');
const app = require('./src/api/server');

async function bootstrap() {
  console.log('====================================================');
  console.log('   🚀 ASTEN! (ASISTEN TENAGA!) - MULTI-BOT SYSTEM   ');
  console.log('   Platform Toko Telegram Otomatis, Aman & Mandiri   ');
  console.log('====================================================');

  try {
    // 1. Verify Database is ready
    const tableCount = db.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get().count;
    console.log(`[Bootstrap] SQLite Database verified with ${tableCount} tables in WAL mode.`);

    // 2. Start Background Expiration Worker (30m payment countdown & license checks)
    expirationWorker.start();

    // 3. Start all registered active bots
    await botManager.startAllActiveBots();

    // 4. Start HTTP Server for Web Portal & REST API
    const server = http.createServer(app);
    server.listen(config.PORT, config.HOST, () => {
      console.log(`[Portal] PORTAL PEMILIK BOT ASTEN! running at: http://localhost:${config.PORT}`);
      console.log(`[API] REST API endpoints available at: http://localhost:${config.PORT}/api`);
      console.log(`[Ready] ASTEN! System is FULLY OPERATIONAL and listening.`);
      console.log('====================================================\n');
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\n[Shutdown] Received ${signal}. Shutting down ASTEN! gracefully...`);
      expirationWorker.stop();

      for (const [botId, info] of botManager.activeInstances.entries()) {
        try {
          await botManager.stopBot(botId);
        } catch (e) {}
      }

      server.close(() => {
        console.log('[Shutdown] HTTP server closed.');
        db.close();
        console.log('[Shutdown] Database connection closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('[Bootstrap Error] Failed to launch ASTEN!:', err);
    process.exit(1);
  }
}

bootstrap();
