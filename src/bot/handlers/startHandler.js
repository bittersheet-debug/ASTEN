/**
 * ASTEN! (ASISTEN TENAGA!) - Start, Help, Menu & Owner Activation Handlers
 */

const { Markup } = require('telegraf');
const TransactionModel = require('../../models/TransactionModel');
const PaymentConfigModel = require('../../models/PaymentConfigModel');
const ProductModel = require('../../models/ProductModel');
const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');
const RnkModel = require('../../models/RnkModel');
const LicenseModel = require('../../models/LicenseModel');

// In-memory set of owners awaiting BotFather token
const awaitingBotTokenOwners = new Set(); // Set<telegramUserId>

const StartHandler = {
  handleStart: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const text = ctx.message?.text || '';
    const payload = text.split(' ')[1] || ''; // Deep link payload

    // 1. Check Deep Link Pay: /start pay_AST-TX-XXXX
    if (payload.startsWith('pay_')) {
      const txId = payload.replace('pay_', '');
      const tx = TransactionModel.findByTransactionId(txId);
      if (!tx) {
        return ctx.reply('❌ <b>Transaksi tidak ditemukan atau telah kedaluwarsa.</b>', { parse_mode: 'HTML' });
      }

      if (tx.status === 'EXPIRED') {
        return ctx.reply('⏳ <b>Transaksi ini telah kedaluwarsa.</b>\nSilakan hubungi Admin toko untuk membuat tagihan baru.', { parse_mode: 'HTML' });
      }

      if (tx.status === 'COMPLETED' || tx.status === 'PAID') {
        return ctx.reply(`✅ <b>Transaksi ${tx.transaction_id} telah lunas dan selesai!</b>`, { parse_mode: 'HTML' });
      }

      // Show Payment Selection to Buyer
      return StartHandler.showBuyerPaymentInvoice(ctx, tx);
    }

    // 2. Check Deep Link RNK: /start rnk_AST-TX-XXXX
    if (payload.startsWith('rnk_')) {
      const txId = payload.replace('rnk_', '');
      const rnkConfig = RnkModel.getConfig(botId);
      const linkRnk = rnkConfig.link_rnk || `https://t.me/c/${rnkConfig.group_comment_id?.replace('-100', '') || ''}`;
      const caption = (rnkConfig.caption || 'Silakan berikan rating dan kritik toko kami.').replace('{LINK_RNK}', linkRnk);

      return ctx.reply(
        `⭐ <b>RATING & KRITIK (RNK)</b>\n\n${caption}\n\n<i>ID Transaksi: <code>${txId}</code></i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.url('📝 Buka Group Comment / Form RNK', linkRnk)]
          ])
        }
      );
    }

    // 3. Check Access Code Activation via /start ASTEN-XXXX-XXXX-XXXX
    if (payload.startsWith('ASTEN-')) {
      return StartHandler.processAccessCodeActivation(ctx, payload);
    }

    // General /start greeting
    const isPrivate = ctx.chat.type === 'private';
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);

    let roleText = '🛍️ Pembeli';
    if (owner) roleText = '👑 Owner';
    else if (admin && admin.is_active) roleText = '🛡️ Admin';

    let greeting = `👋 <b>Selamat datang di ${ctx.botInfo.first_name || 'ASTEN!'}!</b>\n\n`;
    greeting += `Sistem toko Telegram profesional & otomatis bertenaga <b>ASTEN! (ASISTEN TENAGA!)</b>.\n\n`;
    greeting += `Status Anda: <b>${roleText}</b>\n\n`;

    if (owner) {
      greeting += `👑 <b>Halo Owner!</b> Anda memiliki lisensi <b>${owner.license_type}</b> (Kuota: ${owner.max_bots} Bot).\n`;
      greeting += `Untuk mendaftarkan bot baru, cukup kirimkan API Token dari @BotFather di chat ini.\n\n`;
    }

    greeting += `Gunakan menu di bawah untuk melihat pricelist, mengecek transaksi, atau mengelola toko:`;

    const buttons = [
      [Markup.button.callback('📦 Daftar Produk / Price', 'cmd_price'), Markup.button.callback('🔍 Cari Produk', 'cmd_search')],
      [Markup.button.callback('📜 Cek Transaksi Saya', 'cmd_my_tx'), Markup.button.callback('💳 Cara Pembayaran', 'cmd_pay_info')]
    ];

    if (isPrivate && (owner || (admin && admin.is_active))) {
      buttons.push([Markup.button.callback('⚙️ Settings & Manajemen', 'cmd_settings')]);
    }

    return ctx.reply(greeting, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  },

  /**
   * Process Access Code Activation (Prompt Section 19.D & 20)
   */
  processAccessCodeActivation: async (ctx, code) => {
    const userId = String(ctx.from.id);
    const username = ctx.from.username || null;

    const result = await LicenseModel.activateCode(code, userId, username);
    if (!result.success) {
      return ctx.reply(`❌ <b>Aktivasi Gagal:</b>\n${result.message}`, { parse_mode: 'HTML' });
    }

    awaitingBotTokenOwners.add(userId);

    // Exact response specified in Section 20 of prompt!
    let successMsg = `🎉 <b>Selamat! Aktivasi Owner berhasil.</b>\n\n`;
    successMsg += `Nama Owner: <b>${result.owner.name}</b>\n`;
    successMsg += `Jenis Lisensi: <b>${result.owner.license_type}</b>\n`;
    successMsg += `Kuota Bot: <b>${result.owner.max_bots} Bot</b>\n\n`;
    successMsg += `Silakan masukkan <b>API Token bot Telegram</b> yang telah dibuat melalui <b>@BotFather</b>.\n\n`;
    successMsg += `<i>(Ketik atau tempelkan token langsung di chat ini)</i>`;

    return ctx.reply(successMsg, { parse_mode: 'HTML' });
  },

  /**
   * Middleware to catch access code input or BotFather API token in private chat
   */
  processOnboardingMessage: async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) return next();

    const userId = String(ctx.from.id);

    // 1. Check if user typed an access code: ASTEN-XXXX-XXXX-XXXX
    if (/^ASTEN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(text)) {
      return StartHandler.processAccessCodeActivation(ctx, text.toUpperCase());
    }

    // 2. Check if user sent a BotFather API Token
    // Format: 123456789:ABCDefghIJKlmnoPQRstuvWXyz...
    if (/^\d{8,11}:[A-Za-z0-9_-]{35,}$/.test(text)) {
      const owner = OwnerModel.findByTelegramUserId(userId);
      if (!owner) {
        return ctx.reply(
          `⚠️ Anda belum terdaftar sebagai Owner berlisensi.\n` +
          `Silakan masukkan <b>Kode Akses ASTEN!</b> terlebih dahulu (contoh: <code>ASTEN-XXXX-XXXX-XXXX</code>).`,
          { parse_mode: 'HTML' }
        );
      }

      const botManager = require('../botManager');
      await ctx.reply('⏳ <i>Memvalidasi token dengan Telegram Bot API (getMe)...</i>', { parse_mode: 'HTML' });

      const regResult = await botManager.registerAndLaunchBot({
        botToken: text,
        ownerTelegramId: userId,
        ownerId: owner.id
      });

      if (!regResult.success) {
        return ctx.reply(`❌ <b>Gagal Mendaftarkan Bot:</b>\n${regResult.message}`, { parse_mode: 'HTML' });
      }

      awaitingBotTokenOwners.delete(userId);

      const newBot = regResult.bot;
      let botSuccessMsg = `🎉 <b>PENDAFTARAN BOT BERHASIL & LANGSUNG AKTIF!</b>\n`;
      botSuccessMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      botSuccessMsg += `🤖 Nama Bot: <b>${newBot.bot_name}</b>\n`;
      botSuccessMsg += `🔗 Username: @${newBot.bot_username}\n`;
      botSuccessMsg += `🆔 Bot ID: <code>${newBot.bot_id}</code>\n`;
      botSuccessMsg += `👑 Owner: <b>${owner.name}</b>\n`;
      botSuccessMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      botSuccessMsg += `Bot Anda saat ini <b>SUDAH RUNNING</b> dan siap digunakan melayani toko Telegram Anda!\n\n`;
      botSuccessMsg += `Silakan buka bot Anda: <a href="https://t.me/${newBot.bot_username}">@${newBot.bot_username}</a> dan ketik /start.`;

      return ctx.reply(botSuccessMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.url(`🚀 Buka @${newBot.bot_username}`, `https://t.me/${newBot.bot_username}`)]
        ])
      });
    }

    return next();
  },

  showBuyerPaymentInvoice: async (ctx, tx) => {
    const botId = String(ctx.botInfo.id);
    const methods = PaymentConfigModel.getActivePaymentMethods(botId, tx.creator_admin_id);

    if (!methods || methods.length === 0) {
      return ctx.reply(
        `⚠️ <b>Metode Pembayaran Belum Tersedia</b>\n\nAdmin belum mengaktifkan metode pembayaran untuk bot ini. Silakan hubungi Admin toko.`,
        { parse_mode: 'HTML' }
      );
    }

    let invoiceMsg = `🧾 <b>RINCIAN PEMBAYARAN</b>\n`;
    invoiceMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    invoiceMsg += `🔖 ID Transaksi: <code>${tx.transaction_id}</code>\n`;
    invoiceMsg += `📦 Produk: <b>${tx.product_name}</b>\n`;
    invoiceMsg += `🔢 Jumlah: <b>${tx.quantity} pcs</b>\n`;
    invoiceMsg += `💵 Harga Satuan: <b>Rp${Number(tx.unit_price).toLocaleString('id-ID')}</b>\n`;

    // Fee Rule: If fee > 0, display fee line. If fee is not set or 0, DO NOT display fee line or Rp0!
    if (tx.fee && Number(tx.fee) > 0) {
      invoiceMsg += `🏷️ Biaya Layanan / Fee: <b>Rp${Number(tx.fee).toLocaleString('id-ID')}</b>\n`;
    }

    invoiceMsg += `💰 <b>Total Pembayaran: Rp${Number(tx.total_amount).toLocaleString('id-ID')}</b>\n`;
    invoiceMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    invoiceMsg += `⏰ Waktu Pembayaran: <b>30 Menit</b>\n\n`;
    invoiceMsg += `Silakan pilih metode pembayaran di bawah ini untuk melihat detail rekening/e-wallet/QRIS:`;

    const buttons = [];
    methods.forEach(m => {
      let icon = '💳';
      if (m.method_type === 'EWALLET') icon = '📱';
      if (m.method_type === 'QRIS') icon = '📷';
      buttons.push([Markup.button.callback(`${icon} ${m.method_name}`, `payselect_${tx.transaction_id}_${m.id}`)]);
    });

    // Start 30-minute countdown now that instruction is delivered
    TransactionModel.startPaymentCountdown(tx.transaction_id);

    return ctx.reply(invoiceMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  },

  handleHelp: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);

    let helpMsg = `📖 <b>PANDUAN PENGGUNAAN ASTEN!</b>\n\n`;
    helpMsg += `<b>Perintah Publik / Pembeli:</b>\n`;
    helpMsg += `• /start - Memulai bot & menu utama\n`;
    helpMsg += `• /menu - Tampilkan menu interaktif\n`;
    helpMsg += `• /price atau /product - Katalog harga dan stok produk\n`;
    helpMsg += `• /search &lt;nama&gt; - Cari produk berdasarkan kata kunci\n`;
    helpMsg += `• /order - Informasi cara pemesanan barang\n`;
    helpMsg += `• /transaction - Cek status transaksi Anda\n`;
    helpMsg += `• /paymentlist - Daftar metode pembayaran yang tersedia\n\n`;

    if (admin && admin.is_active) {
      helpMsg += `<b>Perintah Admin:</b>\n`;
      helpMsg += `• /payment (REPLY pembeli di grup) - Buat tagihan pembayaran ke Private Chat pembeli\n`;
      helpMsg += `• /done (REPLY bukti transfer) - Verifikasi pembayaran & potong stok otomatis\n`;
      helpMsg += `• /paymentcancel - Batalkan transaksi aktif\n`;
      helpMsg += `• /stock - Cek sisa stok & log riwayat\n`;
      helpMsg += `• /rnk (REPLY pembeli di grup) - Minta rating & mute pembeli hingga review diisi\n`;
      helpMsg += `• /settings - Masuk ke pengaturan pribadi Admin\n\n`;
    }

    if (owner) {
      helpMsg += `<b>Perintah Khusus Owner:</b>\n`;
      helpMsg += `• /settings (Private Chat) - Panel lengkap Owner (Kelola Admin, Produk, Pembayaran, RNK, Grup, Laporan)\n`;
      helpMsg += `• <i>Fitur pendaftaran bot dan manajemen admin tersedia di Private Chat</i>\n\n`;
    }

    helpMsg += `<i>Butuh bantuan lebih lanjut? Hubungi Owner toko atau administrator grup.</i>`;

    return ctx.reply(helpMsg, { parse_mode: 'HTML' });
  },

  handleMenu: async (ctx) => {
    return StartHandler.handleStart(ctx);
  }
};

module.exports = StartHandler;
