/**
 * ASTEN! (ASISTEN TENAGA!) - RNK (Rating and Kritik) Telegram Handler
 */

const TransactionModel = require('../../models/TransactionModel');
const RnkModel = require('../../models/RnkModel');
const RnkService = require('../../services/rnkService');
const AdminModel = require('../../models/AdminModel');
const OwnerModel = require('../../models/OwnerModel');

const RnkHandler = {
  /**
   * /rnk command executed by Admin via reply in transaction group
   */
  handleRnkCommand: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    if (!isGroup) {
      return ctx.reply('⚠️ Perintah /rnk hanya dapat digunakan di dalam grup transaksi dengan cara me-reply pesan pembeli.');
    }

    // Permission check
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);
    const isAuthorized = owner || (admin && admin.is_active);

    if (!isAuthorized) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menjalankan perintah /rnk.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    const replyMsg = ctx.message?.reply_to_message;
    if (!replyMsg || !replyMsg.from) {
      return ctx.reply(
        `ℹ️ <b>Cara Menggunakan /rnk:</b>\n\n` +
        `Admin wajib melakukan <b>REPLY</b> terhadap pesan pembeli di grup setelah pesanan selesai & barang diterima.\n\n` +
        `Sistem akan mengirimkan link penilaian ke Private Chat pembeli dan melakukan auto-mute di grup ini sampai pembeli mengisi review di Group Comment.`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    const targetBuyer = replyMsg.from;
    if (targetBuyer.is_bot) {
      return ctx.reply('❌ Tidak dapat menjalankan RNK terhadap akun bot.', {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    // Verify buyer has a COMPLETED or PAID transaction
    const buyerTxs = TransactionModel.getAllByBotId(botId, 50).filter(
      t => String(t.buyer_id) === String(targetBuyer.id) && (t.status === 'COMPLETED' || t.status === 'PAID')
    );

    if (buyerTxs.length === 0) {
      return ctx.reply(
        `⚠️ <b>Transaksi Belum Selesai / Tidak Valid!</b>\n\n` +
        `Pembeli <a href="tg://user?id=${targetBuyer.id}">${targetBuyer.first_name || 'Pembeli'}</a> belum memiliki riwayat transaksi yang berstatus LUNAS/SELESAI.\n` +
        `Pastikan transaksi telah diverifikasi dengan <code>/done</code> sebelum meminta RNK.`,
        { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
      );
    }

    const latestTx = buyerTxs[0];

    // Request RNK via Service
    const reqRes = await RnkService.requestRnk({
      botId,
      transaction: latestTx,
      transactionGroupId: ctx.chat.id,
      adminTelegramId: userId,
      buyerUser: targetBuyer
    });

    if (!reqRes.success) {
      if (reqRes.needDeepLink) {
        return ctx.reply(
          `⚠️ <b>Pembeli Belum Membuka Private Chat!</b>\n\n` +
          `Halo <a href="tg://user?id=${targetBuyer.id}">${targetBuyer.first_name || 'Pembeli'}</a>, silakan klik tombol di bawah untuk membuka Private Chat dan mengisi RNK:\n\n` +
          `👉 <a href="${reqRes.deepLink}">Buka Link Permintaan RNK</a>`,
          { parse_mode: 'HTML', reply_to_message_id: ctx.message?.message_id }
        );
      }
      return ctx.reply(`❌ <b>Gagal Memproses RNK:</b>\n${reqRes.message}`, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message?.message_id
      });
    }

    // Success response in group
    let groupNotice = `⭐ <b>PERMINTAAN RNK BERHASIL DIAKTIFKAN!</b>\n`;
    groupNotice += `━━━━━━━━━━━━━━━━━━━━━\n`;
    groupNotice += `👤 Pembeli: <a href="tg://user?id=${targetBuyer.id}">${targetBuyer.first_name || 'Pembeli'}</a>\n`;
    groupNotice += `🔖 ID Transaksi: <code>${latestTx.transaction_id}</code>\n`;
    groupNotice += `🔇 Status Chat Grup: <b>MUTED SEMENTARA</b>\n`;
    groupNotice += `━━━━━━━━━━━━━━━━━━━━━\n`;
    groupNotice += `<i>Link RNK telah dikirim ke Private Chat pembeli. Akses chat grup akan <b>otomatis dibuka kembali (AUTO UNMUTE)</b> setelah pembeli memberikan rating & kritik di Group Comment resmi kami. Terima kasih! 💗</i>`;

    return ctx.reply(groupNotice, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message?.message_id
    });
  },

  /**
   * Listen to all messages in groups to detect review submissions in Group Comment
   */
  processGroupCommentListener: async (ctx, next) => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    if (!isGroup) return next();

    const botId = String(ctx.botInfo.id);
    const chatId = String(ctx.chat.id);
    const sender = ctx.from;
    const text = ctx.message?.text || ctx.message?.caption;

    if (sender && !sender.is_bot && text) {
      // Check if this chat is the configured Group Comment for this bot
      const rnkConfig = RnkModel.getConfig(botId);
      if (rnkConfig && rnkConfig.status === 'AKTIF' && String(rnkConfig.group_comment_id) === chatId) {
        // Trigger auto review check
        await RnkService.processGroupCommentMessage(botId, chatId, sender, text);
      }
    }

    return next();
  }
};

module.exports = RnkHandler;
