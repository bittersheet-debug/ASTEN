/**
 * ASTEN! (ASISTEN TENAGA!) - Transaction Model
 */

const db = require('../database/db');
const { generateTransactionId } = require('../security/encryption');
const { TRANSACTION_STATUS, PAYMENT_COUNTDOWN_MINUTES } = require('../config/constants');
const ProductModel = require('./ProductModel');

const TransactionModel = {
  create: ({
    botId,
    groupId = null,
    buyerId,
    buyerName = '',
    buyerUsername = '',
    productId = null,
    productName,
    quantity = 1,
    unitPrice,
    fee = 0,
    creatorAdminId,
    paymentConfigId = null
  }) => {
    const transactionId = generateTransactionId();
    const qty = Math.max(1, parseInt(quantity, 10));
    const price = Number(unitPrice);
    const feeAmount = Number(fee || 0);
    const totalAmount = (price * qty) + feeAmount;
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO transactions (
        transaction_id, bot_id, group_id, buyer_id, buyer_name, buyer_username,
        product_id, product_name, quantity, unit_price, fee, total_amount,
        creator_admin_id, payment_config_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transactionId,
      String(botId),
      groupId ? String(groupId) : null,
      String(buyerId),
      buyerName || '',
      buyerUsername || '',
      productId || null,
      productName,
      qty,
      price,
      feeAmount,
      totalAmount,
      String(creatorAdminId),
      paymentConfigId || null,
      TRANSACTION_STATUS.PENDING,
      now,
      now
    );

    return TransactionModel.findByTransactionId(transactionId);
  },

  findByTransactionId: (transactionId) => {
    if (!transactionId) return null;
    return db.prepare('SELECT * FROM transactions WHERE transaction_id = ?').get(transactionId.trim());
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  },

  getAllByBotId: (botId, limit = 100) => {
    return db.prepare(`
      SELECT * FROM transactions 
      WHERE bot_id = ? 
      ORDER BY created_at DESC LIMIT ?
    `).all(String(botId), limit);
  },

  findActiveByBuyerId: (botId, buyerId) => {
    return db.prepare(`
      SELECT * FROM transactions 
      WHERE bot_id = ? AND buyer_id = ? AND status IN ('PENDING', 'WAITING PAYMENT')
      ORDER BY created_at DESC
    `).all(String(botId), String(buyerId));
  },

  findLatestWaitingByBuyerId: (botId, buyerId) => {
    return db.prepare(`
      SELECT * FROM transactions 
      WHERE bot_id = ? AND buyer_id = ? AND status IN ('PENDING', 'WAITING PAYMENT')
      ORDER BY created_at DESC LIMIT 1
    `).get(String(botId), String(buyerId));
  },

  /**
   * Start 30-minute payment countdown when instruction is delivered to buyer PM
   */
  startPaymentCountdown: (transactionId, paymentMethodDetails = null, buyerChatMessageId = null) => {
    const now = Date.now();
    const expiresAt = now + (PAYMENT_COUNTDOWN_MINUTES * 60 * 1000);

    db.prepare(`
      UPDATE transactions SET
        status = ?,
        invoice_sent_at = ?,
        expires_at = ?,
        payment_details_json = COALESCE(?, payment_details_json),
        buyer_chat_message_id = COALESCE(?, buyer_chat_message_id),
        updated_at = ?
      WHERE transaction_id = ?
    `).run(
      TRANSACTION_STATUS.WAITING_PAYMENT,
      now,
      expiresAt,
      paymentMethodDetails ? JSON.stringify(paymentMethodDetails) : null,
      buyerChatMessageId || null,
      now,
      transactionId
    );

    return TransactionModel.findByTransactionId(transactionId);
  },

  /**
   * Mark transaction as PAID / COMPLETED by Admin via /done
   * Deducts stock if product is linked and prevents negative stock!
   */
  verifyAndComplete: (transactionId, verifiedByAdminId) => {
    const tx = TransactionModel.findByTransactionId(transactionId);
    if (!tx) {
      return { success: false, message: 'Transaksi tidak ditemukan.' };
    }

    if (tx.status === TRANSACTION_STATUS.PAID || tx.status === TRANSACTION_STATUS.COMPLETED) {
      return { success: false, message: 'Transaksi ini sudah diverifikasi sebelumnya.' };
    }

    if (tx.status === TRANSACTION_STATUS.EXPIRED) {
      return { success: false, message: 'Transaksi ini sudah kedaluwarsa.' };
    }

    if (tx.status === TRANSACTION_STATUS.CANCELLED) {
      return { success: false, message: 'Transaksi ini telah dibatalkan.' };
    }

    const now = Date.now();

    // Deduct stock if product exists
    let stockResult = null;
    if (tx.product_id) {
      stockResult = ProductModel.adjustStock(
        tx.product_id,
        -tx.quantity,
        `Penjualan Tx: ${tx.transaction_id}`,
        verifiedByAdminId
      );
    }

    db.prepare(`
      UPDATE transactions SET
        status = ?,
        verified_at = ?,
        verified_by = ?,
        updated_at = ?
      WHERE transaction_id = ?
    `).run(
      TRANSACTION_STATUS.COMPLETED,
      now,
      String(verifiedByAdminId),
      now,
      transactionId
    );

    const updatedTx = TransactionModel.findByTransactionId(transactionId);

    return {
      success: true,
      transaction: updatedTx,
      stockResult
    };
  },

  /**
   * Cancel transaction via /paymentcancel
   */
  cancel: (transactionId, cancelledByAdminId) => {
    const tx = TransactionModel.findByTransactionId(transactionId);
    if (!tx) {
      return { success: false, message: 'Transaksi tidak ditemukan.' };
    }

    if (tx.status === TRANSACTION_STATUS.COMPLETED || tx.status === TRANSACTION_STATUS.PAID) {
      return { success: false, message: 'Transaksi yang sudah selesai tidak dapat dibatalkan.' };
    }

    const now = Date.now();
    db.prepare(`
      UPDATE transactions SET
        status = ?,
        updated_at = ?
      WHERE transaction_id = ?
    `).run(TRANSACTION_STATUS.CANCELLED, now, transactionId);

    return {
      success: true,
      transaction: TransactionModel.findByTransactionId(transactionId)
    };
  },

  /**
   * Expire transactions whose countdown has elapsed
   */
  checkAndExpireTransactions: () => {
    const now = Date.now();
    const expiredTxs = db.prepare(`
      SELECT * FROM transactions 
      WHERE status = 'WAITING PAYMENT' AND expires_at IS NOT NULL AND expires_at < ?
    `).all(now);

    if (expiredTxs.length > 0) {
      const stmt = db.prepare(`
        UPDATE transactions SET status = 'EXPIRED', updated_at = ? 
        WHERE transaction_id = ?
      `);
      for (const tx of expiredTxs) {
        stmt.run(now, tx.transaction_id);
      }
    }

    return expiredTxs;
  },

  getStats: (botId) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE bot_id = ?').get(String(botId)).count;
    const completed = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE bot_id = ? AND status IN ('PAID', 'COMPLETED')").get(String(botId)).count;
    const waiting = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE bot_id = ? AND status = 'WAITING PAYMENT'").get(String(botId)).count;
    const expired = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE bot_id = ? AND status = 'EXPIRED'").get(String(botId)).count;
    const cancelled = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE bot_id = ? AND status = 'CANCELLED'").get(String(botId)).count;
    const totalRevenue = db.prepare("SELECT SUM(total_amount) as sum FROM transactions WHERE bot_id = ? AND status IN ('PAID', 'COMPLETED')").get(String(botId)).sum || 0;

    return { total, completed, waiting, expired, cancelled, totalRevenue };
  }
};

module.exports = TransactionModel;
