/**
 * ASTEN! (ASISTEN TENAGA!) - Access Code Generation Bot Handler
 * Allows generating access codes (ASTEN-XXXX-XXXX-XXXX) directly via @Astenobot!
 */

const { Markup } = require('telegraf');
const LicenseModel = require('../../models/LicenseModel');
const LogModel = require('../../models/LogModel');
const realtimeService = require('../../services/realtimeService');
const { LICENSE_DURATIONS, CODE_STATUS } = require('../../config/constants');

// In-memory wizard sessions: userId -> session object
const creationSessions = new Map();

// Helper to cleanup stale sessions after 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of creationSessions.entries()) {
    if (now - (session.updatedAt || 0) > 15 * 60 * 1000) {
      creationSessions.delete(userId);
    }
  }
}, 60 * 1000);

const AccessCodeBotHandler = {
  /**
   * Command /buatkode, /createcode, /gencode
   * Supports:
   * 1. Direct one-line: /buatkode <Nama_Owner> [durasi_hari/lisensi] [kuota_bot]
   * 2. Interactive Wizard: /buatkode (without arguments)
   */
  handleCreateCodeCommand: async (ctx) => {
    const userId = String(ctx.from.id);
    const text = (ctx.message?.text || '').trim();

    // Match quoted arguments or whitespace-separated arguments
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const tokens = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[1] !== undefined ? match[1] : (match[2] !== undefined ? match[2] : match[0]));
    }
    const args = tokens.slice(1);

    // If user provided arguments, e.g. /buatkode "Toko Berkah" 30 1
    if (args.length >= 1) {
      const ownerName = args[0].trim();
      let durationInput = args[1] || '30';
      let maxBots = parseInt(args[2], 10) || 1;

      let licenseType = '1_MONTH';
      let durationDays = 30;

      const durUpper = durationInput.toUpperCase();
      if (durUpper === 'PERMANENT' || durUpper === 'PERMANEN' || durUpper === '0') {
        licenseType = 'PERMANENT';
        durationDays = 0;
      } else if (durUpper === '3_MONTHS' || durUpper === '90') {
        licenseType = '3_MONTHS';
        durationDays = 90;
      } else if (durUpper === '6_MONTHS' || durUpper === '180') {
        licenseType = '6_MONTHS';
        durationDays = 180;
      } else if (durUpper === '1_YEAR' || durUpper === '365') {
        licenseType = '1_YEAR';
        durationDays = 365;
      } else if (durUpper === '2_YEARS' || durUpper === '730') {
        licenseType = '2_YEARS';
        durationDays = 730;
      } else {
        const parsedDays = parseInt(durationInput, 10);
        if (!isNaN(parsedDays) && parsedDays > 0) {
          durationDays = parsedDays;
          licenseType = parsedDays === 30 ? '1_MONTH' : (parsedDays === 90 ? '3_MONTHS' : 'CUSTOM');
        }
      }

      return AccessCodeBotHandler.finalizeCodeCreation(ctx, {
        ownerName,
        licenseType,
        durationDays,
        maxBots
      });
    }

    // Interactive Wizard Mode
    creationSessions.set(userId, {
      step: 'WAITING_NAME',
      updatedAt: Date.now()
    });

    let promptMsg = `🎫 <b>PEMBUATAN KODE AKSES BARU</b>\n`;
    promptMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    promptMsg += `Silakan ketik <b>Nama Calon Owner atau Nama Toko</b> yang akan didaftarkan:\n\n`;
    promptMsg += `<i>(Contoh: Toko Berkah / Budi Santoso)</i>\n\n`;
    promptMsg += `<i>Ketik /batal jika ingin membatalkan.</i>`;

    return ctx.reply(promptMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('❌ Batalkan', 'gencode_cancel')]
      ])
    });
  },

  /**
   * Middleware to process text inputs during wizard steps
   */
  processWizardMessage: async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const text = ctx.message?.text?.trim();
    if (!text) return next();

    const userId = String(ctx.from.id);
    const session = creationSessions.get(userId);
    if (!session) return next();

    // Check cancellation
    if (text === '/batal' || text.toLowerCase() === 'batal') {
      creationSessions.delete(userId);
      return ctx.reply('❌ <b>Pembuatan kode akses dibatalkan.</b>', { parse_mode: 'HTML' });
    }

    session.updatedAt = Date.now();

    // STEP 1: User typed Owner Name
    if (session.step === 'WAITING_NAME') {
      session.ownerName = text;
      session.step = 'WAITING_DURATION_CHOICE';

      let durMsg = `👤 Nama Calon Owner: <b>${session.ownerName}</b>\n\n`;
      durMsg += `Pilih <b>Masa Lisensi / Durasi</b> yang diinginkan:`;

      const buttons = [
        [
          Markup.button.callback('🟢 1 Bulan (30 Hari)', 'gencode_dur_30'),
          Markup.button.callback('🔵 3 Bulan (90 Hari)', 'gencode_dur_90')
        ],
        [
          Markup.button.callback('🟣 6 Bulan (180 Hari)', 'gencode_dur_180'),
          Markup.button.callback('🟡 1 Tahun (365 Hari)', 'gencode_dur_365')
        ],
        [
          Markup.button.callback('🟠 2 Tahun (730 Hari)', 'gencode_dur_730'),
          Markup.button.callback('⭐ PERMANEN', 'gencode_dur_PERMANENT')
        ],
        [
          Markup.button.callback('⏱️ Custom Hari...', 'gencode_dur_CUSTOM')
        ],
        [
          Markup.button.callback('❌ Batalkan', 'gencode_cancel')
        ]
      ];

      return ctx.reply(durMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    }

    // STEP 2b: User typed custom days
    if (session.step === 'WAITING_CUSTOM_DAYS') {
      const days = parseInt(text, 10);
      if (isNaN(days) || days <= 0) {
        return ctx.reply('⚠️ Harap masukkan jumlah hari dalam angka positif (contoh: <code>45</code>):', { parse_mode: 'HTML' });
      }

      session.durationDays = days;
      session.licenseType = 'CUSTOM';
      session.step = 'WAITING_BOTS_CHOICE';

      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    }

    // STEP 3b: User typed custom bots quota
    if (session.step === 'WAITING_CUSTOM_BOTS') {
      const bots = parseInt(text, 10);
      if (isNaN(bots) || bots <= 0 || bots > 100) {
        return ctx.reply('⚠️ Harap masukkan kuota bot antara 1 sampai 100:', { parse_mode: 'HTML' });
      }

      session.maxBots = bots;
      creationSessions.delete(userId);
      return AccessCodeBotHandler.finalizeCodeCreation(ctx, session);
    }

    return next();
  },

  /**
   * Prompt Bot Quota Selection (Step 3)
   */
  promptBotQuota: async (ctx, session) => {
    let quotaMsg = `👤 Nama Owner: <b>${session.ownerName}</b>\n`;
    quotaMsg += `⏱️ Durasi: <b>${session.licenseType === 'PERMANENT' ? 'Permanen (Seumur Hidup)' : session.durationDays + ' Hari'}</b>\n\n`;
    quotaMsg += `Pilih <b>Maksimal Kuota Bot</b> yang diizinkan untuk Owner ini:`;

    const buttons = [
      [
        Markup.button.callback('🤖 1 Bot', 'gencode_bots_1'),
        Markup.button.callback('🤖 2 Bot', 'gencode_bots_2'),
        Markup.button.callback('🤖 3 Bot', 'gencode_bots_3')
      ],
      [
        Markup.button.callback('🤖 5 Bot', 'gencode_bots_5'),
        Markup.button.callback('🤖 10 Bot', 'gencode_bots_10'),
        Markup.button.callback('🔢 Custom...', 'gencode_bots_CUSTOM')
      ],
      [
        Markup.button.callback('❌ Batalkan', 'gencode_cancel')
      ]
    ];

    if (ctx.callbackQuery) {
      await ctx.editMessageText(quotaMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    } else {
      await ctx.reply(quotaMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
    }
  },

  /**
   * Finalize and create the access code
   */
  finalizeCodeCreation: async (ctx, data) => {
    const { ownerName, licenseType, durationDays, maxBots } = data;
    const actorId = String(ctx.from?.id || 'SYSTEM');

    try {
      const codeRecord = LicenseModel.createAccessCode({
        ownerName,
        licenseType,
        durationDays: licenseType === 'PERMANENT' ? 0 : durationDays,
        maxBots: maxBots || 1,
        notes: `Digenerate via @${ctx.botInfo?.username || 'Astenobot'} oleh ID: ${actorId}`
      });

      // Record Activity Log
      LogModel.log({
        actorType: 'TELEGRAM',
        actorId,
        action: 'ACCESS_CODE_GENERATED',
        details: `Kode akses ${codeRecord.code} dibuat via Telegram untuk ${ownerName} (${licenseType}, ${maxBots} Bot).`
      });

      // Broadcast real-time SSE event to web portal!
      realtimeService.broadcast('access_code_created', {
        code: codeRecord.code,
        ownerName: codeRecord.owner_name,
        licenseType: codeRecord.license_type,
        durationDays: codeRecord.duration_days,
        maxBots: codeRecord.max_bots,
        status: 'UNUSED',
        createdAt: codeRecord.created_at,
        timestamp: Date.now()
      });

      const masterUsername = ctx.botInfo?.username || 'Astenobot';
      const deepLink = `https://t.me/${masterUsername}?start=${codeRecord.code}`;

      let msg = `🎉 <b>KODE AKSES BERHASIL DIBUAT!</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
      msg += `🎟️ <b>KODE AKSES:</b>\n`;
      msg += `<code>${codeRecord.code}</code>\n`;
      msg += `<i>(Ketuk kode di atas untuk langsung menyalin)</i>\n\n`;
      msg += `👤 <b>Nama Calon Owner:</b> ${codeRecord.owner_name}\n`;
      msg += `⏱️ <b>Masa Lisensi:</b> ${codeRecord.license_type === 'PERMANENT' ? '⭐ PERMANEN (Seumur Hidup)' : `${codeRecord.duration_days} Hari (${codeRecord.license_type})`}\n`;
      msg += `🤖 <b>Kuota Bot:</b> ${codeRecord.max_bots} Bot\n`;
      msg += `📌 <b>Status:</b> 🟡 UNUSED (Siap Digunakan)\n\n`;
      msg += `🔗 <b>Link Aktivasi 1-Klik:</b>\n`;
      msg += `<a href="${deepLink}">${deepLink}</a>\n\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Kirimkan kode atau tautan di atas kepada calon Owner. Ketika mereka membuka link atau mengirimkan kode ini ke <b>@${masterUsername}</b>, lisensi langsung aktif otomatis!`;

      const buttons = [
        [
          Markup.button.url('🚀 Bagikan Link Aktivasi', `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(`Halo! Ini kode akses ASTEN! Anda: ${codeRecord.code}`)}`)
        ],
        [
          Markup.button.callback('🎫 Buat Kode Lain', 'btn_buat_kode_start'),
          Markup.button.callback('📜 Daftar Semua Kode', 'btn_daftar_kode')
        ]
      ];

      if (ctx.callbackQuery) {
        return ctx.editMessageText(msg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons)
        });
      } else {
        return ctx.reply(msg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard(buttons)
        });
      }
    } catch (err) {
      console.error('[AccessCodeBotHandler] Error creating code:', err);
      const errMsg = `❌ <b>Gagal membuat kode akses:</b>\n${err.message}`;
      if (ctx.callbackQuery) return ctx.editMessageText(errMsg, { parse_mode: 'HTML' });
      return ctx.reply(errMsg, { parse_mode: 'HTML' });
    }
  },

  /**
   * Command /listkode, /daftarkode, /codes
   */
  handleListCodes: async (ctx) => {
    const codes = LicenseModel.getAllCodes();

    if (!codes || codes.length === 0) {
      return ctx.reply(
        `📜 <b>Daftar Kode Akses ASTEN!</b>\n\nBelum ada kode akses yang digenerate.\nKetik /buatkode untuk membuat kode pertama.`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🎫 Buat Kode Akses Sekarang', 'btn_buat_kode_start')]
          ])
        }
      );
    }

    const latest = codes.slice(0, 10);
    let msg = `📜 <b>DAFTAR KODE AKSES ASTEN! (10 Terbaru)</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    latest.forEach((c, i) => {
      const isUsed = c.status === CODE_STATUS.USED;
      const statusIcon = isUsed ? '🟣 [USED]' : '🟡 [UNUSED]';

      msg += `${i + 1}. ${statusIcon} <code>${c.code}</code>\n`;
      msg += `   👤 <b>${c.owner_name}</b> | ${c.license_type} | 🤖 ${c.max_bots} Bot\n`;
      if (isUsed && c.used_at) {
        const d = new Date(c.used_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        msg += `   <i>✅ Telah diaktifkan (${d})</i>\n`;
      }
      msg += `\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `<i>Ketuk kode mana saja untuk menyalin ke clipboard.</i>`;

    return ctx.reply(msg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Buat Kode Baru', 'btn_buat_kode_start')],
        [Markup.button.callback('🔄 Refresh Daftar', 'btn_daftar_kode')]
      ])
    });
  },

  /**
   * Register Callback Actions on Telegraf Instance
   */
  registerCallbacks: (bot) => {
    // 1. Duration Selection Callbacks
    bot.action('gencode_dur_30', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 30;
      session.licenseType = '1_MONTH';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_90', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 90;
      session.licenseType = '3_MONTHS';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_180', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 180;
      session.licenseType = '6_MONTHS';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_365', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 365;
      session.licenseType = '1_YEAR';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_730', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 730;
      session.licenseType = '2_YEARS';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_PERMANENT', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.durationDays = 0;
      session.licenseType = 'PERMANENT';
      session.step = 'WAITING_BOTS_CHOICE';
      return AccessCodeBotHandler.promptBotQuota(ctx, session);
    });

    bot.action('gencode_dur_CUSTOM', async (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      session.step = 'WAITING_CUSTOM_DAYS';
      return ctx.editMessageText(
        `👤 Nama Owner: <b>${session.ownerName}</b>\n\n` +
        `Ketik <b>jumlah hari</b> lisensi yang diinginkan:\n` +
        `<i>(Contoh ketik: <code>45</code> atau <code>120</code>)</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('❌ Batalkan', 'gencode_cancel')]
          ])
        }
      );
    });

    // 2. Bot Quota Selection Callbacks
    bot.action(/^gencode_bots_(\d+|CUSTOM)$/, (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      const session = creationSessions.get(userId);
      if (!session) return ctx.reply('⚠️ Sesi telah berakhir. Ketik /buatkode untuk memulai kembali.');

      const param = ctx.match[1];
      if (param === 'CUSTOM') {
        session.step = 'WAITING_CUSTOM_BOTS';
        return ctx.editMessageText(
          `👤 Nama Owner: <b>${session.ownerName}</b>\n\n` +
          `Ketik <b>jumlah maksimal bot</b> yang diizinkan:\n` +
          `<i>(Contoh ketik: <code>15</code> atau <code>50</code>)</i>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('❌ Batalkan', 'gencode_cancel')]
            ])
          }
        );
      }

      session.maxBots = parseInt(param, 10) || 1;
      creationSessions.delete(userId);
      return AccessCodeBotHandler.finalizeCodeCreation(ctx, session);
    });

    // 3. Cancel Button
    bot.action('gencode_cancel', (ctx) => {
      ctx.answerCbQuery();
      const userId = String(ctx.from.id);
      creationSessions.delete(userId);
      return ctx.editMessageText('❌ <b>Pembuatan kode akses dibatalkan.</b>', { parse_mode: 'HTML' });
    });

    // 4. Quick action buttons
    bot.action('btn_buat_kode_start', (ctx) => {
      ctx.answerCbQuery();
      return AccessCodeBotHandler.handleCreateCodeCommand(ctx);
    });

    bot.action('btn_daftar_kode', (ctx) => {
      ctx.answerCbQuery();
      return AccessCodeBotHandler.handleListCodes(ctx);
    });
  }
};

module.exports = AccessCodeBotHandler;
