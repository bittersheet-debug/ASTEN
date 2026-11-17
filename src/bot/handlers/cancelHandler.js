/**
 * ASTEN! (ASISTEN TENAGA!) - Payment Cancel Handler (/paymentcancel)
 */

const TransactionModel = require('../../models/TransactionModel');
const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');
const TelegramService = require('../../services/telegramService');
const BotModel = require('../../models/BotModel');
const LogModel = require('../../models/LogModel');

const CancelHandler = {
  handleCancel: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);

    // Permission check
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);
    const isAuthorized = owner || (admin && admin.is_active);

    if (!isAuthorized) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk membatalkan transaksi.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    parts.shift(); // remove /paymentcancel

    let targetTxId = null;

    if (parts.length > 0 && parts[0].startsWith('AST-TX-')) {
      targetTxId = parts[0];
    } else if (ctx.message?.reply_to_message?.from) {
      const targetUser = ctx.message.reply_to_message.from;
      const latestTx = TransactionModel.findLatestWaitingByBuyerId(botId, targetUser.id);
      if (latestTx) {
        targetTxId = latestTx.transaction_id;
      }
    }

    if (!targetTxId) {
      return ctx.reply(
        `ℹ️ <b>Cara Menggunakan /paymentcancel:</b>\n\n` +
        `1. Lakukan <b>REPLY</b> pesan transaksi pembeli, lalu ketik <code>/paymentcancel</code>, ATAU\n` +
        `2. Ketik langsung ID Transaksi: <code>/paymentcancel &lt;ID_TRANSAKSI&gt;</code>`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    const cancelRes = TransactionModel.cancel(targetTxId, userId);
    if (!cancelRes.success) {
      return ctx.reply(`❌ <b>Gagal Membatalkan:</b> ${cancelRes.message}`, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const tx = cancelRes.transaction;
    const bot = BotModel.findByBotId(botId);

    LogModel.log({
      botId,
      actorType: 'ADMIN',
      actorId: userId,
      action: 'TRANSACTION_CANCELLED',
      details: `Transaksi ${tx.transaction_id} dibatalkan oleh ${userId}.`
    });

    // Notify group
    await ctx.reply(
      `🚫 <b>TRANSAKSI DIBATALKAN!</b>\n\n` +
      `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n` +
      `👤 Pembeli: <a href="tg://user?id=${tx.buyer_id}">${tx.buyer_name || 'Pembeli'}</a>\n` +
      `📦 Produk: <b>${tx.product_name}</b>\n` +
      `Status transaksi telah diubah menjadi <b>CANCELLED</b>.`,
      { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
    );

    // Notify buyer privately
    if (bot && bot.bot_token && tx.buyer_id) {
      await TelegramService.sendMessage(
        bot.bot_token,
        tx.buyer_id,
        `🚫 <b>Pemberitahuan Pembatalan Transaksi</b>\n\n` +
        `Transaksi <code>${tx.transaction_id}</code> untuk pesanan <b>${tx.product_name}</b> telah dibatalkan oleh Admin toko.`
      );
    }
  }
};

module.exports = CancelHandler;
