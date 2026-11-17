/**
 * ASTEN! (ASISTEN TENAGA!) - Done Verification Handler (/done)
 */

const { Markup } = require('telegraf');
const TransactionModel = require('../../models/TransactionModel');
const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');
const BotModel = require('../../models/BotModel');
const TelegramService = require('../../services/telegramService');
const LogModel = require('../../models/LogModel');

const DoneHandler = {
  handleDone: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);

    // Permission check
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);
    const isAuthorized = owner || (admin && admin.is_active && admin.permissions.includes('can_verify_done'));

    if (!isAuthorized) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk memverifikasi transaksi.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    parts.shift(); // remove /done

    // Check if explicit transaction ID was supplied: /done AST-TX-XXXX
    if (parts.length > 0 && parts[0].startsWith('AST-TX-')) {
      const explicitTxId = parts[0];
      return DoneHandler.executeDoneVerification(ctx, explicitTxId, userId);
    }

    // Check reply message
    const replyMessage = ctx.message?.reply_to_message;
    if (!replyMessage || !replyMessage.from) {
      return ctx.reply(
        `ℹ️ <b>Cara Menggunakan /done:</b>\n\n` +
        `1. Lakukan <b>REPLY</b> terhadap bukti transfer / pesan pembeli di grup, lalu ketik <code>/done</code>, ATAU\n` +
        `2. Ketik langsung ID Transaksi: <code>/done &lt;ID_TRANSAKSI&gt;</code>\n` +
        `Contoh: <code>/done AST-TX-20261117-ABC123</code>`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    const targetUser = replyMessage.from;

    // Search active pending/waiting transactions for this buyer
    const activeTxs = TransactionModel.findActiveByBuyerId(botId, targetUser.id);

    if (activeTxs.length === 0) {
      return ctx.reply(
        `⚠️ Tidak ditemukan transaksi berstatus menunggu pembayaran untuk pembeli <a href="tg://user?id=${targetUser.id}">${targetUser.first_name || 'Pembeli'}</a>.`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    // If multiple matching transactions exist, prompt Admin to select Transaction ID
    if (activeTxs.length > 1) {
      let selectMsg = `🔍 <b>Ditemukan ${activeTxs.length} Transaksi Menunggu Pembayaran:</b>\n\n`;
      selectMsg += `Silakan pilih ID Transaksi yang ingin diverifikasi:\n`;

      const buttons = activeTxs.map(tx => [
        Markup.button.callback(
          `🔖 ${tx.transaction_id} (Rp${Number(tx.total_amount).toLocaleString('id-ID')})`,
          `confirm_done_${tx.transaction_id}`
        )
      ]);

      return ctx.reply(selectMsg, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message?.message_id,
        ...Markup.inlineKeyboard(buttons)
      });
    }

    // Exactly 1 matching transaction
    return DoneHandler.executeDoneVerification(ctx, activeTxs[0].transaction_id, userId);
  },

  /**
   * Execute verification of transaction
   */
  executeDoneVerification: async (ctx, txId, adminUserId) => {
    const botId = String(ctx.botInfo.id);
    const result = TransactionModel.verifyAndComplete(txId, adminUserId);

    if (!result.success) {
      return ctx.reply(`❌ <b>Gagal Verifikasi:</b> ${result.message}`, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const tx = result.transaction;
    const bot = BotModel.findByBotId(botId);

    LogModel.log({
      botId,
      actorType: 'ADMIN',
      actorId: adminUserId,
      action: 'TRANSACTION_VERIFIED',
      details: `Transaksi ${tx.transaction_id} diverifikasi lunas oleh Admin ${adminUserId}. Stok dipotong: ${result.stockResult?.success ? 'Ya' : 'N/A'}`
    });

    let confirmMsg = `✅ <b>PEMBAYARAN TERVERIFIKASI & SELESAI!</b>\n`;
    confirmMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    confirmMsg += `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n`;
    confirmMsg += `👤 Pembeli: <a href="tg://user?id=${tx.buyer_id}">${tx.buyer_name || 'Pembeli'}</a>\n`;
    confirmMsg += `📦 Produk: <b>${tx.product_name}</b> (x${tx.quantity})\n`;
    confirmMsg += `💰 Total: <b>Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n`;
    confirmMsg += `👮 Diverifikasi oleh: <a href="tg://user?id=${adminUserId}">${ctx.from?.first_name || 'Admin'}</a>\n`;
    confirmMsg += `🕒 Waktu: <b>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>\n`;
    confirmMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    confirmMsg += `🎉 Transaksi telah ditutup secara resmi. Terima kasih atas kerja samanya!`;

    // 1. Reply to group
    await ctx.reply(confirmMsg, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message?.message_id
    });

    // 2. Notify buyer in Private Chat
    if (bot && bot.bot_token && tx.buyer_id) {
      await TelegramService.sendMessage(
        bot.bot_token,
        tx.buyer_id,
        `🎉 <b>Pembayaran Anda Telah Diverifikasi!</b>\n\n` +
        `Transaksi <code>${tx.transaction_id}</code> untuk produk <b>${tx.product_name}</b> telah dinyatakan <b>LUNAS & SELESAI</b>.\n\n` +
        `Terima kasih telah berbelanja di toko kami! Barang pesanan Anda segera diproses oleh Admin toko.`
      );
    }

    // 3. Delete bot payment instruction message if stored & allowed
    if (tx.buyer_chat_message_id && bot && bot.bot_token) {
      try {
        await TelegramService.deleteMessage(bot.bot_token, tx.buyer_id, tx.buyer_chat_message_id);
      } catch (err) {
        // Safe ignore
      }
    }
  }
};

module.exports = DoneHandler;
