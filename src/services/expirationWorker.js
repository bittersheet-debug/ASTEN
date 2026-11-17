/**
 * ASTEN! (ASISTEN TENAGA!) - Expiration & Background Worker
 */

const db = require('../database/db');
const TransactionModel = require('../models/TransactionModel');
const BotModel = require('../models/BotModel');
const TelegramService = require('./telegramService');
const LogModel = require('../models/LogModel');
const config = require('../config/config');

let workerInterval = null;

const ExpirationWorker = {
  start: () => {
    if (workerInterval) return;

    console.log('[ExpirationWorker] ASTEN! Background Expiration Worker started.');

    // Run every interval (15s)
    workerInterval = setInterval(async () => {
      try {
        await ExpirationWorker.processExpiredTransactions();
        await ExpirationWorker.processExpiredLicenses();
      } catch (err) {
        console.error('[ExpirationWorker] Error during worker run:', err.message);
      }
    }, config.EXPIRATION_WORKER_INTERVAL);
  },

  stop: () => {
    if (workerInterval) {
      clearInterval(workerInterval);
      workerInterval = null;
      console.log('[ExpirationWorker] Background Worker stopped.');
    }
  },

  /**
   * Process 30-minute payment countdowns
   */
  processExpiredTransactions: async () => {
    const expiredTxs = TransactionModel.checkAndExpireTransactions();
    if (!expiredTxs || expiredTxs.length === 0) return;

    for (const tx of expiredTxs) {
      console.log(`[ExpirationWorker] Transaction ${tx.transaction_id} marked as EXPIRED.`);

      LogModel.log({
        botId: tx.bot_id,
        actorType: 'SYSTEM',
        actorId: 'WORKER',
        action: 'TRANSACTION_EXPIRED',
        details: `Transaksi ${tx.transaction_id} kedaluwarsa setelah 30 menit tanpa pembayaran.`
      });

      // Try notifying the buyer via private message
      try {
        const bot = BotModel.findByBotId(tx.bot_id);
        if (bot && bot.bot_token) {
          await TelegramService.sendMessage(
            bot.bot_token,
            tx.buyer_id,
            `⏳ <b>Waktu Pembayaran Habis!</b>\n\nTransaksi <code>${tx.transaction_id}</code> untuk produk <b>${tx.product_name}</b> telah kedaluwarsa (batas waktu 30 menit telah lewat).\n\nSilakan hubungi Admin atau buat pesanan baru untuk mendapatkan tagihan terkini.`
          );
        }
      } catch (err) {
        // Safe ignore
      }
    }
  },

  /**
   * Process Owner License expirations and reminder alerts (7d, 3d, 1d)
   */
  processExpiredLicenses: async () => {
    const now = Date.now();

    // Check expired owners
    const expiredOwners = db.prepare(`
      SELECT * FROM owners 
      WHERE license_type != 'PERMANENT' 
        AND license_expires_at IS NOT NULL 
        AND license_expires_at < ? 
        AND status = 'ACTIVE'
    `).all(now);

    for (const owner of expiredOwners) {
      console.log(`[ExpirationWorker] Owner ${owner.name} (ID: ${owner.id}) license EXPIRED.`);
      
      // Update owner status
      db.prepare("UPDATE owners SET status = 'EXPIRED', updated_at = ? WHERE id = ?").run(now, owner.id);
      
      // Suspend associated bots
      db.prepare("UPDATE bots SET status = 'EXPIRED', updated_at = ? WHERE owner_id = ?").run(now, owner.id);

      LogModel.log({
        ownerId: owner.id,
        actorType: 'SYSTEM',
        actorId: 'WORKER',
        action: 'LICENSE_EXPIRED',
        details: `Lisensi Owner ${owner.name} telah kedaluwarsa. Bot dinonaktifkan.`
      });
    }
  }
};

module.exports = ExpirationWorker;
