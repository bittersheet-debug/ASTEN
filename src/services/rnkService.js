/**
 * ASTEN! (ASISTEN TENAGA!) - RNK (Rating and Kritik) Service
 */

const RnkModel = require('../models/RnkModel');
const BotModel = require('../models/BotModel');
const TelegramService = require('./telegramService');
const LogModel = require('../models/LogModel');

const RnkService = {
  /**
   * Request RNK:
   * Called when Admin runs /rnk via reply in transaction group.
   */
  requestRnk: async ({ botId, transaction, transactionGroupId, adminTelegramId, buyerUser }) => {
    const bot = BotModel.findByBotId(botId);
    if (!bot || !bot.bot_token) {
      return { success: false, message: 'Bot tidak ditemukan atau token tidak valid.' };
    }

    const rnkConfig = RnkModel.getConfig(botId);
    if (rnkConfig.status !== 'AKTIF' || !rnkConfig.group_comment_id) {
      return { 
        success: false, 
        message: 'Fitur RNK belum aktif! Pastikan Owner telah mengatur Caption, Link, dan ID Group Comment di Settings Owner.' 
      };
    }

    // Format caption with link
    const linkRnk = rnkConfig.link_rnk || `https://t.me/c/${rnkConfig.group_comment_id.replace('-100', '')}`;
    const formattedCaption = rnkConfig.caption.replace('{LINK_RNK}', linkRnk);

    // 1. Try sending RNK to buyer Private Chat FIRST!
    const sendResult = await TelegramService.sendMessage(
      bot.bot_token,
      buyerUser.id,
      `⭐ <b>PERMINTAAN RATING & KRITIK (RNK)</b>\n\n${formattedCaption}\n\n<i>ID Transaksi: <code>${transaction.transaction_id}</code></i>`
    );

    if (!sendResult.success) {
      // Buyer has not pressed start or blocked the bot
      const deepLink = `https://t.me/${bot.bot_username}?start=rnk_${transaction.transaction_id}`;
      return {
        success: false,
        needDeepLink: true,
        deepLink,
        message: `Pembeli belum membuka Private Chat dengan bot.\nSilakan minta pembeli menekan link berikut: ${deepLink}`
      };
    }

    // 2. Mute buyer in transaction group
    let muteSuccess = false;
    let muteError = null;
    try {
      const muteRes = await TelegramService.muteUser(bot.bot_token, transactionGroupId, buyerUser.id);
      muteSuccess = muteRes.success;
      if (!muteRes.success) muteError = muteRes.error;
    } catch (err) {
      muteError = err.message;
    }

    // 3. Save RNK record
    const record = RnkModel.createRecord({
      botId,
      transactionId: transaction.transaction_id,
      buyerId: buyerUser.id,
      buyerName: buyerUser.first_name || buyerUser.username || '',
      transactionGroupId,
      groupCommentId: rnkConfig.group_comment_id,
      adminTelegramId,
      caption: formattedCaption,
      linkRnk
    });

    LogModel.log({
      botId,
      actorType: 'ADMIN',
      actorId: adminTelegramId,
      action: 'RNK_REQUESTED',
      details: `Permintaan RNK dikirim ke pembeli ${buyerUser.id} untuk transaksi ${transaction.transaction_id}. Status Mute: ${muteSuccess ? 'BERHASIL' : 'GAGAL (' + muteError + ')'}`
    });

    return {
      success: true,
      record,
      muteSuccess,
      muteError
    };
  },

  /**
   * Automatic RNK verification when a message arrives in Group Comment
   */
  processGroupCommentMessage: async (botId, groupCommentId, senderUser, text) => {
    if (!text || text.trim().length < 5) return null; // Reject empty/trivial spam

    const pendingRnk = RnkModel.findPendingByBuyerAndCommentGroup(botId, senderUser.id, groupCommentId);
    if (!pendingRnk) {
      return null; // Not waiting for RNK
    }

    const bot = BotModel.findByBotId(botId);
    if (!bot || !bot.bot_token) return null;

    console.log(`[RnkService] Received valid RNK review from buyer ${senderUser.id} for tx ${pendingRnk.transaction_id}`);

    // Complete RNK record
    RnkModel.completeRecord(pendingRnk.id, text);

    // AUTO UNMUTE buyer in original transaction group
    let unmuteSuccess = false;
    let unmuteError = null;
    try {
      const unmuteRes = await TelegramService.unmuteUser(
        bot.bot_token,
        pendingRnk.transaction_group_id,
        pendingRnk.buyer_id
      );
      unmuteSuccess = unmuteRes.success;
      if (!unmuteRes.success) unmuteError = unmuteRes.error;
    } catch (err) {
      unmuteError = err.message;
    }

    if (unmuteSuccess) {
      RnkModel.markUnmuted(pendingRnk.id);
    }

    // Notify buyer privately
    await TelegramService.sendMessage(
      bot.bot_token,
      pendingRnk.buyer_id,
      `✅ <b>Rating dan Kritik Berhasil Diverifikasi!</b>\n\nTerima kasih banyak atas penilaian Anda untuk transaksi <code>${pendingRnk.transaction_id}</code>. Akses chat Anda di grup toko telah dibuka kembali secara otomatis. Selamat berbelanja kembali! 💖`
    );

    // Notify original transaction group
    await TelegramService.sendMessage(
      bot.bot_token,
      pendingRnk.transaction_group_id,
      `🎉 <b>RNK Terverifikasi & Unmute Otomatis!</b>\n\nPembeli <a href="tg://user?id=${pendingRnk.buyer_id}">${pendingRnk.buyer_name || 'Pembeli'}</a> telah mengisi RNK di Group Comment.\nAkses grup telah berhasil dibuka kembali! ✅`
    );

    LogModel.log({
      botId,
      actorType: 'BUYER',
      actorId: pendingRnk.buyer_id,
      action: 'RNK_COMPLETED',
      details: `RNK transaksi ${pendingRnk.transaction_id} terverifikasi. Unmute: ${unmuteSuccess ? 'BERHASIL' : 'GAGAL (' + unmuteError + ')'}`
    });

    return {
      success: true,
      unmuteSuccess,
      pendingRnk
    };
  }
};

module.exports = RnkService;
