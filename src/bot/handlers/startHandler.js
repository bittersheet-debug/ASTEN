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
const realtimeService = require('../../services/realtimeService');
const BotModel = require('../../models/BotModel');
const LogModel = require('../../models/LogModel');

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
    const isOfficial = ctx.botInfo?.username?.toLowerCase() === 'astenobot' || botId === '9167134826';
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);

    let roleText = '🛍️ Pembeli';
    if (owner) roleText = '👑 Owner';
    else if (admin && admin.is_active) roleText = '🛡️ Admin';

    // SPECIAL MASTER MENU FOR OFFICIAL BOT (@Astenobot)
    if (isOfficial && isPrivate) {
      let masterMsg = `👋 <b>Selamat datang di Official ASTEN Bot (@${ctx.botInfo.username})!</b>\n`;
      masterMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      masterMsg += `Bot ini merupakan pusat verifikasi dan aktivasi lisensi sistem toko Telegram bertenaga <b>ASTEN! (ASISTEN TENAGA!)</b>.\n\n`;

      if (owner) {
        masterMsg += `👑 <b>Status Akun: Owner Berlisensi</b>\n`;
        masterMsg += `• Nama Owner: <b>${owner.name}</b>\n`;
        masterMsg += `• Jenis Lisensi: <b>${owner.license_type}</b>\n`;
        masterMsg += `• Kuota Bot: <b>${owner.max_bots} Bot</b>\n\n`;
        masterMsg += `Silakan pilih menu di bawah untuk mendaftarkan bot toko baru atau mengelola bot Anda:`;
      } else {
        masterMsg += `Untuk mengaktifkan bot toko Anda, silakan klik tombol di bawah untuk memasukkan <b>Kode Akses</b>:\n\n`;
        masterMsg += `<i>(Atau langsung ketikkan kode akses Anda di chat ini, contoh: <code>ASTEN-XXXX-XXXX-XXXX</code>)</i>`;
      }

      const masterButtons = [];
      if (!owner) {
        masterButtons.push([
          Markup.button.callback('🔑 Masukkan Kode Akses Anda', 'btn_input_access_code')
        ]);
      } else {
        masterButtons.push([
          Markup.button.callback('🤖 Daftarkan Bot Baru', 'owner_add_bot_prompt'),
          Markup.button.callback('📋 Bot Toko Saya', 'btn_my_bots')
        ]);
        masterButtons.push([
          Markup.button.callback('🔑 Masukkan Kode Akses Tambahan', 'btn_input_access_code')
        ]);
      }

      return ctx.reply(masterMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(masterButtons)
      });
    }

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

    // Record Activity Log
    LogModel.log({
      ownerId: result.owner.id,
      actorType: 'TELEGRAM',
      actorId: String(userId),
      action: 'ACCESS_CODE_ACTIVATED',
      details: `Kode akses ${code} berhasil diaktifkan via Telegram oleh @${username || userId} (${result.owner.name}).`
    });

    // Broadcast to real-time website dashboard!
    realtimeService.broadcast('owner_activated', {
      owner: result.owner,
      timestamp: Date.now()
    });

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

    // 1. Check if user typed an access code: ASTEN-XXXX-XXXX-XXXX (or typed code variant)
    const normalizedCode = text.toUpperCase().replace(/\s+/g, '');
    if (normalizedCode.startsWith('ASTEN')) {
      return StartHandler.processAccessCodeActivation(ctx, normalizedCode);
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

      // Broadcast instant push event to website dashboard & "Manajemen Bot"!
      realtimeService.broadcast('bot_registered', {
        bot: newBot,
        ownerName: owner.name,
        timestamp: Date.now()
      });
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
      helpMsg += `• /mybots - Lihat & kontrol bot toko milik Anda\n`;
      helpMsg += `• /addbot - Tambah bot baru via Token BotFather\n`;
      helpMsg += `• /status - Cek status sistem & server 24 jam\n`;
      helpMsg += `• /settings (Private Chat) - Panel lengkap Owner\n\n`;
    }

    helpMsg += `<i>Butuh bantuan lebih lanjut? Hubungi Owner toko atau administrator grup.</i>`;

    return ctx.reply(helpMsg, { parse_mode: 'HTML' });
  },

  handleMyBots: async (ctx) => {
    const userId = String(ctx.from.id);
    const owner = OwnerModel.findByTelegramUserId(userId);
    if (!owner) {
      return ctx.reply('⚠️ Anda belum terdaftar sebagai Owner. Silakan aktifkan kode akses terlebih dahulu.');
    }

    const myBots = BotModel.findByOwnerId(owner.id).filter(b => !b.is_official);
    if (myBots.length === 0) {
      return ctx.reply(
        `🤖 <b>Daftar Bot Anda (0 Bot)</b>\n\n` +
        `Anda belum mendaftarkan bot toko.\n` +
        `Ketik /addbot atau langsung kirimkan API Token dari @BotFather di chat ini untuk menambahkan bot baru!`,
        { parse_mode: 'HTML' }
      );
    }

    let msg = `🤖 <b>DAFTAR BOT TOKO ANDA (${myBots.length}/${owner.max_bots} Bot)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    const buttons = [];
    myBots.forEach((b, i) => {
      let icon = '🟢';
      if (b.operational_status === 'OFFLINE' || b.status === 'INACTIVE') icon = '🔴';
      else if (b.operational_status === 'ERROR') icon = '🟠';
      else if (b.operational_status === 'RESTARTING') icon = '🔵';

      msg += `${i + 1}. ${icon} <b>${b.bot_name}</b> (@${b.bot_username})\n`;
      msg += `   ID: <code>${b.bot_id}</code> | Status: <b>${b.operational_status || 'ONLINE'}</b>\n\n`;

      buttons.push([
        Markup.button.callback(`🔄 Restart @${b.bot_username}`, `restart_owner_bot_${b.bot_id}`),
        Markup.button.callback(b.status === 'ACTIVE' ? '⏸️ Stop' : '▶️ Start', `toggle_owner_bot_${b.bot_id}`)
      ]);
    });

    if (myBots.length < owner.max_bots) {
      buttons.push([Markup.button.callback('➕ Tambah Bot Baru', 'owner_add_bot_prompt')]);
    }

    return ctx.reply(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  },

  handleAddBot: async (ctx) => {
    const userId = String(ctx.from.id);
    const owner = OwnerModel.findByTelegramUserId(userId);
    if (!owner) {
      return ctx.reply('⚠️ Anda belum terdaftar sebagai Owner. Masukkan Kode Akses ASTEN! Anda terlebih dahulu.');
    }

    const currentBotsCount = BotModel.countTenantBotsByOwnerId(owner.id);
    if (currentBotsCount >= owner.max_bots) {
      return ctx.reply(`⚠️ <b>Kuota Bot Penuh!</b>\nAnda sudah memiliki ${currentBotsCount} dari maksimal ${owner.max_bots} bot.\nHubungi administrator untuk upgrade kuota lisensi Anda.`, { parse_mode: 'HTML' });
    }

    awaitingBotTokenOwners.add(userId);

    let msg = `🤖 <b>PENAMBAHAN BOT TOKO BARU</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg += `1. Buka <b>@BotFather</b> di Telegram.\n`;
    msg += `2. Ketik perintah <code>/newbot</code> dan ikuti instruksi hingga selesai.\n`;
    msg += `3. Salin <b>HTTP API Token</b> yang diberikan @BotFather.\n`;
    msg += `4. Tempelkan (paste) token tersebut langsung ke chat ini.\n\n`;
    msg += `<i>Sistem akan otomatis memvalidasi, menyimpan secara terenkripsi, dan langsung menjalankan bot Anda 24 jam!</i>`;

    return ctx.reply(msg, { parse_mode: 'HTML' });
  },

  handleSystemStatus: async (ctx) => {
    const stats = BotModel.getStats();
    const uptimeSec = Math.floor(process.uptime());
    const hours = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);

    let msg = `⚡ <b>STATUS SISTEM OFFICIAL ASTEN BOT</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👑 Master Bot: <b>@Astenobot</b> (🟢 ONLINE 24 JAM)\n`;
    msg += `📊 Bot Toko Aktif: <b>${stats.active}</b> / ${stats.total} terdaftar\n`;
    msg += `⏱️ Uptime Server: <b>${hours} jam ${mins} menit</b>\n`;
    msg += `💾 Database: <b>SQLite WAL Native (Synchronous)</b>\n`;
    msg += `🛡️ Auto-Recovery: <b>Aktif (Self-Healing Watchdog)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<i>Seluruh bot toko berjalan otomatis dan independen di latar belakang.</i>`;

    return ctx.reply(msg, { parse_mode: 'HTML' });
  },

  handleMenu: async (ctx) => {
    return StartHandler.handleStart(ctx);
  },

  /**
   * Hidden Master Command: /itsme
   * Menampilkan fitur buat kode akses, daftar kode akses, daftarkan bot baru, dan monitoring
   */
  handleItsMe: async (ctx) => {
    let itsMeMsg = `👑 <b>PANEL RAHASIA ASTEN! (/itsme)</b>\n`;
    itsMeMsg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    itsMeMsg += `Selamat datang di Pusat Kendali Master <b>@${ctx.botInfo?.username || 'Astenobot'}</b>.\n\n`;
    itsMeMsg += `Silakan pilih fitur yang ingin Anda jalankan:`;

    const itsMeButtons = [
      [
        Markup.button.callback('🎫 Buat Kode Akses', 'btn_buat_kode_start'),
        Markup.button.callback('📜 Daftar Kode Akses', 'btn_daftar_kode')
      ],
      [
        Markup.button.callback('🤖 Daftarkan Bot Baru', 'owner_add_bot_prompt'),
        Markup.button.callback('⚡ Status Sistem 24 Jam', 'btn_status_sistem')
      ]
    ];

    return ctx.reply(itsMeMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(itsMeButtons)
    });
  }
};

module.exports = StartHandler;
