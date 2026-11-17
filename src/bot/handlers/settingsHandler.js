/**
 * ASTEN! (ASISTEN TENAGA!) - Private Settings & Security Handler
 */

const { Markup } = require('telegraf');
const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');
const PaymentConfigModel = require('../../models/PaymentConfigModel');
const RnkModel = require('../../models/RnkModel');
const ProductModel = require('../../models/ProductModel');
const TransactionModel = require('../../models/TransactionModel');
const GroupModel = require('../../models/GroupModel');
const CustomCommandModel = require('../../models/CustomCommandModel');
const { comparePassword } = require('../../security/encryption');
const {
  isUserLocked,
  recordFailedAttempt,
  resetFailedAttempts,
  createSession,
  hasActiveSession,
  safeDeleteMessage
} = require('../../security/auth');
const { PAYMENT_METHODS } = require('../../config/constants');
const fs = require('fs');

// Session states for password prompt or settings input
const pendingSettingsAuth = new Map(); // `${botId}:${userId}` -> { role, timestamp }

const SettingsHandler = {
  /**
   * /settings command router
   */
  handleSettings: async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);

    // Rule: Never open settings in group!
    if (!isPrivate) {
      return ctx.reply(
        `🔒 <b>Pengaturan Toko Bersifat Rahasia</b>\n\n` +
        `Semua konfigurasi Owner dan Admin hanya dapat diakses melalui <b>Private Chat</b> demi menjaga keamanan token, saldo, dan password toko Anda.\n\n` +
        `Silakan buka Private Chat dengan menekan tombol di bawah:`,
        {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message?.message_id,
          ...Markup.inlineKeyboard([
            [Markup.button.url('⚙️ Buka Private Settings', `https://t.me/${ctx.botInfo.username}?start=settings`)]
          ])
        }
      );
    }

    // In Private Chat: verify identity
    const owner = OwnerModel.findByTelegramUserId(userId);
    const admin = AdminModel.findByTelegramUserId(botId, userId);

    if (!owner && (!admin || !admin.is_active)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin akses untuk membuka panel pengaturan toko ini.');
    }

    // Check lockout status
    const lockStatus = isUserLocked(botId, userId);
    if (lockStatus.locked) {
      return ctx.reply(`🔒 <b>Akses Terkunci!</b>\nTerlalu banyak percobaan salah. Silakan tunggu <b>${Math.ceil(lockStatus.remainingSeconds / 60)} menit</b> lagi.`, { parse_mode: 'HTML' });
    }

    // Check active 15-minute authenticated session
    if (hasActiveSession(botId, userId)) {
      if (owner) {
        return SettingsHandler.showOwnerMainMenu(ctx);
      } else {
        return SettingsHandler.showAdminMainMenu(ctx, admin);
      }
    }

    // If session expired or not authenticated yet: prompt for password
    const role = owner ? 'owner' : 'admin';
    pendingSettingsAuth.set(`${botId}:${userId}`, { role, owner, admin });

    return ctx.reply(
      `🔐 <b>AUTENTIKASI KEAMANAN ASTEN!</b>\n\n` +
      `Sesi Anda telah berakhir atau belum terverifikasi.\n` +
      `Silakan ketik <b>Password ${owner ? 'Owner' : 'Admin'}</b> Anda untuk melanjutkan:\n\n` +
      `<i>(Pesan password Anda akan dihapus secara otomatis demi keamanan)</i>`,
      { parse_mode: 'HTML' }
    );
  },

  /**
   * Process password input in private chat
   */
  processSettingsAuthMessage: async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const key = `${botId}:${userId}`;
    const pending = pendingSettingsAuth.get(key);

    if (!pending) return next();

    const passwordInput = ctx.message?.text?.trim();
    if (!passwordInput || passwordInput.startsWith('/')) {
      pendingSettingsAuth.delete(key);
      return next();
    }

    // Safely delete password message from chat
    await safeDeleteMessage(ctx);

    const hashToCompare = pending.role === 'owner' ? pending.owner.password_hash : pending.admin.password_hash;
    const isMatch = await comparePassword(passwordInput, hashToCompare);

    if (!isMatch) {
      const attempt = recordFailedAttempt(botId, userId);
      if (attempt.locked) {
        pendingSettingsAuth.delete(key);
        return ctx.reply(`🔒 <b>Akses Terkunci!</b>\n3 kali salah memasukkan password. Akses dikunci selama 15 menit.`, { parse_mode: 'HTML' });
      }
      return ctx.reply(`❌ <b>Password Salah!</b>\nSisa kesempatan: <b>${attempt.remainingAttempts}x</b> lagi.\nSilakan masukkan password yang benar:`, { parse_mode: 'HTML' });
    }

    // Success! Create 15-minute session
    createSession(botId, userId, pending.role);
    pendingSettingsAuth.delete(key);

    if (pending.role === 'owner') {
      return SettingsHandler.showOwnerMainMenu(ctx);
    } else {
      return SettingsHandler.showAdminMainMenu(ctx, pending.admin);
    }
  },

  /**
   * Owner Main Menu
   */
  showOwnerMainMenu: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const owner = OwnerModel.findByTelegramUserId(ctx.from.id);
    const txStats = TransactionModel.getStats(botId);
    const prodStats = ProductModel.getStats(botId);
    const adminCount = AdminModel.countByBotId(botId);

    let text = `👑 <b>PANEL SETTINGS OWNER - ASTEN!</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Owner: <b>${owner ? owner.name : ctx.from.first_name}</b>\n`;
    text += `Lisensi: <b>${owner ? owner.license_type : 'ACTIVE'}</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 <b>Statistik Cepat:</b>\n`;
    text += `• Total Transaksi: <b>${txStats.total}</b> (Lunas: ${txStats.completed})\n`;
    text += `• Total Omset: <b>Rp${Number(txStats.totalRevenue).toLocaleString('id-ID')}</b>\n`;
    text += `• Total Produk: <b>${prodStats.totalProducts}</b> (Stok: ${prodStats.totalStock} pcs)\n`;
    text += `• Admin Aktif: <b>${adminCount} orang</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Pilih menu pengaturan yang ingin Anda kelola:`;

    const buttons = [
      [Markup.button.callback('👥 Manajemen Admin', 'set_owner_admins'), Markup.button.callback('💳 Metode Pembayaran', 'set_payments')],
      [Markup.button.callback('⭐ Pengaturan RNK', 'set_owner_rnk'), Markup.button.callback('📦 Kelola Produk & Stok', 'set_owner_products')],
      [Markup.button.callback('💬 Custom Reply & Alias', 'set_owner_custom_cmds'), Markup.button.callback('👥 Kelola Grup Toko', 'set_owner_groups')],
      [Markup.button.callback('📈 Laporan & Riwayat', 'set_owner_reports'), Markup.button.callback('🔒 Kunci Sesi', 'lock_session')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
  },

  /**
   * Admin Main Menu
   */
  showAdminMainMenu: async (ctx, admin) => {
    let text = `🛡️ <b>PANEL SETTINGS ADMIN - ASTEN!</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Nama Admin: <b>${admin.name}</b>\n`;
    text += `ID Telegram: <code>${admin.telegram_user_id}</code>\n`;
    text += `Status Penanggung Jawab Pembayaran: <b>${admin.is_payment_responsible ? 'YA' : 'TIDAK'}</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Kelola konfigurasi dan jalan pintas transaksi Anda:`;

    const buttons = [
      [Markup.button.callback('💳 Rekening / Pembayaran Saya', 'set_admin_payments')],
      [Markup.button.callback('⚡ Custom Command Payment (/bayar)', 'set_admin_aliases')],
      [Markup.button.callback('💬 Custom Command Reply (/rules, dll)', 'set_admin_replies')],
      [Markup.button.callback('🔒 Kunci Sesi', 'lock_session')]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    }
  },

  /**
   * Payment Settings Submenu (E-Wallet, Bank, QRIS)
   */
  showPaymentSettingsMenu: async (ctx, forAdminId = null) => {
    const botId = String(ctx.botInfo.id);
    const methods = PaymentConfigModel.getAllByBotId(botId, forAdminId);

    let text = `💳 <b>PENGATURAN METODE PEMBAYARAN</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Pengaturan: <b>${forAdminId ? 'Admin (' + forAdminId + ')' : 'Default Toko / Owner'}</b>\n\n`;

    if (methods.length === 0) {
      text += `<i>Belum ada metode pembayaran yang dikonfigurasi.</i>\n\n`;
    } else {
      methods.forEach((m, idx) => {
        const statusBadge = m.is_active ? '🟢 Aktif' : '🔴 Nonaktif';
        let icon = m.method_type === 'QRIS' ? '📷' : (m.method_type === 'EWALLET' ? '📱' : '🏦');
        text += `${idx + 1}. ${icon} <b>${m.method_name}</b>: ${statusBadge}\n`;
        if (m.account_number) text += `   Nomor: <code>${m.account_number}</code> (${m.account_name})\n`;
        if (m.fee && Number(m.fee) > 0) text += `   Fee: Rp${Number(m.fee).toLocaleString('id-ID')}\n`;
        text += `\n`;
      });
    }

    text += `Gunakan tombol di bawah untuk menambah atau mengaktifkan metode:`;

    const buttons = [
      [
        Markup.button.callback('➕ Tambah E-Wallet', `add_pay_EWALLET_${forAdminId || 'default'}`),
        Markup.button.callback('➕ Tambah Bank', `add_pay_BANK_${forAdminId || 'default'}`)
      ],
      [
        Markup.button.callback('📷 Kelola QRIS', `manage_qris_${forAdminId || 'default'}`)
      ],
      [
        Markup.button.callback('⬅️ Kembali ke Menu Utama', 'back_to_main_menu')
      ]
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  },

  /**
   * RNK Settings Submenu (Owner)
   */
  showRnkSettingsMenu: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const rnkConfig = RnkModel.getConfig(botId);
    const rnkStats = RnkModel.getStats(botId);

    let text = `⭐ <b>PENGATURAN RNK (RATING & KRITIK)</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Status Aktivasi: <b>${rnkConfig.status}</b>\n`;
    text += `ID Group Comment: <code>${rnkConfig.group_comment_id || 'Belum diatur'}</code>\n`;
    text += `Link RNK: <code>${rnkConfig.link_rnk || 'Otomatis ke Group Comment'}</code>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 Statistik RNK:\n`;
    text += `• Total Permintaan: <b>${rnkStats.total}</b>\n`;
    text += `• Menunggu Pembeli (Muted): <b>${rnkStats.waiting}</b>\n`;
    text += `• Selesai (Unmuted): <b>${rnkStats.completed}</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `<b>Caption RNK Saat Ini:</b>\n<i>${rnkConfig.caption.substring(0, 150)}...</i>\n\n`;
    text += `Pilih aksi pengaturan RNK:`;

    const buttons = [
      [
        Markup.button.callback('📝 Ubah Caption RNK', 'rnk_edit_caption'),
        Markup.button.callback('🔗 Atur Link RNK', 'rnk_edit_link')
      ],
      [
        Markup.button.callback('💬 Atur ID Group Comment', 'rnk_edit_group'),
        Markup.button.callback(rnkConfig.status === 'AKTIF' ? '🔴 Nonaktifkan RNK' : '🟢 Aktifkan RNK', 'rnk_toggle_status')
      ],
      [
        Markup.button.callback('👁️ Preview Pesan RNK', 'rnk_preview'),
        Markup.button.callback('⬅️ Kembali ke Menu Utama', 'back_to_main_menu')
      ]
    ];

    return ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }
};

module.exports = SettingsHandler;
