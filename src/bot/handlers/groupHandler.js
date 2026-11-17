/**
 * ASTEN! (ASISTEN TENAGA!) - Group Management, @admins Tag & Auto Activation
 */

const GroupModel = require('../../models/GroupModel');
const BotModel = require('../../models/BotModel');
const OwnerModel = require('../../models/OwnerModel');
const TelegramService = require('../../services/telegramService');
const LogModel = require('../../models/LogModel');

const GroupHandler = {
  /**
   * Listen for @admins mention in group chat
   */
  processAdminTagMention: async (ctx, next) => {
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    if (!isGroup) return next();

    const text = ctx.message?.text || ctx.message?.caption || '';
    if (text.includes('@admins') || text.includes('/admins')) {
      const botId = String(ctx.botInfo.id);
      const bot = BotModel.findByBotId(botId);
      if (!bot || !bot.bot_token) return next();

      // Retrieve owner Telegram User ID to exclude
      const ownerTelegramId = bot.owner_telegram_id;

      const adminResult = await TelegramService.getAdminsForTagging(
        bot.bot_token,
        ctx.chat.id,
        ownerTelegramId
      );

      if (adminResult.success && adminResult.mentions.length > 0) {
        let tagMsg = `📢 <b>PANGGILAN UNTUK SELURUH ADMIN:</b>\n\n`;
        tagMsg += adminResult.mentions.join(' ') + `\n\n`;
        tagMsg += `<i>Diminta bantuan dan responnya di grup ini. Terima kasih!</i>`;

        await ctx.reply(tagMsg, {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
      }
    }

    return next();
  },

  /**
   * Auto Group Activation via my_chat_member status changes
   */
  handleMyChatMemberUpdate: async (ctx) => {
    const update = ctx.myChatMember;
    if (!update) return;

    const botId = String(ctx.botInfo.id);
    const chatId = String(update.chat.id);
    const chatTitle = update.chat.title || 'Grup Toko';
    const oldStatus = update.old_chat_member?.status;
    const newStatus = update.new_chat_member?.status;

    console.log(`[GroupHandler] Bot status changed in group ${chatId} (${chatTitle}): ${oldStatus} -> ${newStatus}`);

    // Case 1: Bot added as regular member
    if (newStatus === 'member' && oldStatus !== 'member') {
      // Save group as pending administrator promotion
      GroupModel.upsert({
        botId,
        groupId: chatId,
        groupTitle: chatTitle,
        isAdmin: 0,
        permissions: {}
      });

      return ctx.reply(
        `👋 <b>Halo Semua! Terima kasih telah menambahkan ASTEN! ke grup ini.</b>\n\n` +
        `Agar seluruh fitur ASTEN! (transaksi pembayaran, auto-tag @admins, dan sistem mute/unmute RNK) dapat berjalan normal, mohon jadikan bot ini sebagai <b>Administrator Grup</b> dengan izin:\n` +
        `• Batasi Pengguna (Restrict Members)\n` +
        `• Hapus Pesan (Delete Messages)\n` +
        `• Sematkan Pesan (Pin Messages)\n\n` +
        `<i>Bot akan secara otomatis mendeteksi promosi dan mengaktifkan fitur grup begitu izin diberikan.</i>`,
        { parse_mode: 'HTML' }
      );
    }

    // Case 2: Bot promoted to Administrator
    if (newStatus === 'administrator') {
      const perms = {
        can_restrict_members: update.new_chat_member.can_restrict_members,
        can_delete_messages: update.new_chat_member.can_delete_messages,
        can_pin_messages: update.new_chat_member.can_pin_messages
      };

      GroupModel.upsert({
        botId,
        groupId: chatId,
        groupTitle: chatTitle,
        isAdmin: 1,
        permissions: perms
      });

      LogModel.log({
        botId,
        actorType: 'SYSTEM',
        actorId: chatId,
        action: 'GROUP_ACTIVATED',
        details: `Bot berhasil diangkat menjadi Administrator di grup ${chatTitle} (${chatId}). Fitur grup aktif.`
      });

      return ctx.reply(
        `🎉 <b>AKTIVASI GRUP BERHASIL!</b>\n\n` +
        `Bot <b>${ctx.botInfo.first_name}</b> telah resmi menjadi Administrator di grup <b>${chatTitle}</b>.\n` +
        `Seluruh fitur grup ASTEN! kini <b>AKTIF</b> dan siap digunakan melayani pelanggan.`,
        { parse_mode: 'HTML' }
      );
    }

    // Case 3: Bot demoted or removed/kicked from group
    if (newStatus === 'kicked' || newStatus === 'left' || (oldStatus === 'administrator' && newStatus === 'member')) {
      GroupModel.setInactive(botId, chatId);

      const bot = BotModel.findByBotId(botId);
      if (bot && bot.owner_telegram_id) {
        await TelegramService.sendMessage(
          bot.bot_token,
          bot.owner_telegram_id,
          `⚠️ <b>Pemberitahuan Status Grup Toko:</b>\n\nBot Anda kehilangan status Administrator atau telah dikeluarkan dari grup <b>${chatTitle}</b> (ID: <code>${chatId}</code>).\nFitur grup dinonaktifkan sementara.`
        );
      }

      LogModel.log({
        botId,
        actorType: 'SYSTEM',
        actorId: chatId,
        action: 'GROUP_DEACTIVATED',
        details: `Bot kehilangan status Admin di grup ${chatTitle} (${chatId}). Status diubah menjadi INACTIVE.`
      });
    }
  }
};

module.exports = GroupHandler;
