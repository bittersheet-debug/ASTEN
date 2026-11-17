/**
 * ASTEN! (ASISTEN TENAGA!) - Hidden /admin Command & Owner Password System
 */

const OwnerModel = require('../../models/OwnerModel');
const AdminModel = require('../../models/AdminModel');
const { comparePassword } = require('../../security/encryption');
const {
  isUserLocked,
  recordFailedAttempt,
  resetFailedAttempts,
  createSession,
  hasActiveSession,
  safeDeleteMessage
} = require('../../security/auth');
const LogModel = require('../../models/LogModel');

// Temporary conversation states for admin creation in Private Chat
// key: `${botId}:${ownerTelegramId}` -> { step, candidateName, candidateUserId, candidatePassword }
const ownerAdminCreationFlow = new Map();

const AdminHandler = {
  /**
   * Hidden /admin <namaadmin> command
   */
  handleHiddenAdminCommand: async (ctx) => {
    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const isPrivate = ctx.chat.type === 'private';

    // Must ONLY be used in Private Chat!
    if (!isPrivate) {
      // Reject silently or standard unknown command in group to prevent leaking internal existence
      return;
    }

    const owner = OwnerModel.findByTelegramUserId(userId);
    if (!owner) {
      // Unauthorized user: reject without leaking internal functionality
      return ctx.reply('Perintah tidak dikenali. Ketik /help untuk bantuan.');
    }

    // Check if user is locked out (3 failed attempts -> 15 min lock)
    const lockStatus = isUserLocked(botId, userId);
    if (lockStatus.locked) {
      return ctx.reply(`🔒 <b>Akses Terkunci Sementara!</b>\nTerlalu banyak percobaan gagal. Silakan coba lagi dalam <b>${Math.ceil(lockStatus.remainingSeconds / 60)} menit</b>.`, { parse_mode: 'HTML' });
    }

    const text = ctx.message?.text || '';
    const parts = text.trim().split(/\s+/);
    parts.shift(); // remove /admin
    const candidateName = parts.join(' ').trim();

    if (!candidateName) {
      return ctx.reply('Format: <code>/admin &lt;nama_admin&gt;</code>\nContoh: <code>/admin BudiSantoso</code>', { parse_mode: 'HTML' });
    }

    const flowKey = `${botId}:${userId}`;

    // Check if owner already has an active 15-minute auth session
    if (hasActiveSession(botId, userId)) {
      // Already authenticated, jump directly to step 2 (ask for candidate Telegram User ID)
      ownerAdminCreationFlow.set(flowKey, {
        step: 'AWAITING_ADMIN_USER_ID',
        candidateName
      });

      return ctx.reply(
        `👑 <b>PENDAFTARAN ADMIN BARU</b>\n\n` +
        `Nama Calon Admin: <b>${candidateName}</b>\n\n` +
        `Silakan masukkan <b>Telegram User ID</b> calon Admin (angka):\n` +
        `<i>(Minta calon admin mengirim pesan ke @userinfobot untuk mengetahui ID mereka)</i>`,
        { parse_mode: 'HTML' }
      );
    }

    // Step 1: Prompt for Owner password
    ownerAdminCreationFlow.set(flowKey, {
      step: 'AWAITING_OWNER_PASSWORD',
      candidateName
    });

    return ctx.reply(
      `🔐 <b>VERIFIKASI KEAMANAN OWNER</b>\n\n` +
      `Untuk menambahkan Admin baru (<b>${candidateName}</b>), silakan masukkan <b>Password Owner</b> Anda:`,
      { parse_mode: 'HTML' }
    );
  },

  /**
   * Intercept text messages in private chat for the multi-step Admin registration flow
   */
  processAdminFlowMessage: async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const botId = String(ctx.botInfo.id);
    const userId = String(ctx.from.id);
    const flowKey = `${botId}:${userId}`;
    const flow = ownerAdminCreationFlow.get(flowKey);

    if (!flow) return next();

    const text = ctx.message?.text?.trim();
    if (!text || text.startsWith('/')) {
      // User typed a command, cancel flow
      ownerAdminCreationFlow.delete(flowKey);
      return next();
    }

    const owner = OwnerModel.findByTelegramUserId(userId);
    if (!owner) {
      ownerAdminCreationFlow.delete(flowKey);
      return next();
    }

    // STEP 1: Verify Owner Password
    if (flow.step === 'AWAITING_OWNER_PASSWORD') {
      // Safely delete the password message immediately
      await safeDeleteMessage(ctx);

      const isMatch = await comparePassword(text, owner.password_hash);
      if (!isMatch) {
        const attempt = recordFailedAttempt(botId, userId);
        if (attempt.locked) {
          ownerAdminCreationFlow.delete(flowKey);
          return ctx.reply(`🔒 <b>Akses Terkunci!</b>\n3 kali salah password. Akses terkunci selama 15 menit.`, { parse_mode: 'HTML' });
        }
        return ctx.reply(`❌ <b>Password Owner Salah!</b>\nSisa percobaan: <b>${attempt.remainingAttempts}x</b> lagi.\nSilakan masukkan kembali:`, { parse_mode: 'HTML' });
      }

      // Password valid: create 15-minute session
      createSession(botId, userId, 'owner');
      flow.step = 'AWAITING_ADMIN_USER_ID';
      ownerAdminCreationFlow.set(flowKey, flow);

      return ctx.reply(
        `✅ <b>Verifikasi Berhasil!</b>\n\n` +
        `Nama Calon Admin: <b>${flow.candidateName}</b>\n\n` +
        `Silakan masukkan <b>Telegram User ID</b> calon Admin (angka ID akun Telegram):`,
        { parse_mode: 'HTML' }
      );
    }

    // STEP 2: Input Candidate Admin Telegram User ID
    if (flow.step === 'AWAITING_ADMIN_USER_ID') {
      if (!/^\d+$/.test(text)) {
        return ctx.reply('⚠️ Telegram User ID harus berupa angka bulat. Contoh: <code>123456789</code>\nSilakan masukkan kembali:', { parse_mode: 'HTML' });
      }

      flow.candidateUserId = text;
      flow.step = 'AWAITING_ADMIN_PASSWORD';
      ownerAdminCreationFlow.set(flowKey, flow);

      return ctx.reply(
        `👤 Telegram User ID diterima: <code>${text}</code>\n\n` +
        `Sekarang tentukan <b>Password untuk Admin</b> ini:\n` +
        `<i>(Password ini ditentukan oleh Owner dan akan digunakan Admin untuk mengakses menu Settings)</i>`,
        { parse_mode: 'HTML' }
      );
    }

    // STEP 3: Owner sets Admin password
    if (flow.step === 'AWAITING_ADMIN_PASSWORD') {
      await safeDeleteMessage(ctx);

      if (text.length < 5) {
        return ctx.reply('⚠️ Password Admin minimal 5 karakter demi keamanan. Silakan ketik kembali:');
      }

      flow.candidatePassword = text;
      flow.step = 'CONFIRM_REGISTRATION';
      ownerAdminCreationFlow.set(flowKey, flow);

      // Register the Admin in database!
      try {
        const newAdmin = await AdminModel.create({
          botId,
          ownerId: owner.id,
          telegramUserId: flow.candidateUserId,
          name: flow.candidateName,
          password: flow.candidatePassword
        });

        ownerAdminCreationFlow.delete(flowKey);

        LogModel.log({
          botId,
          ownerId: owner.id,
          actorType: 'OWNER',
          actorId: userId,
          action: 'ADMIN_CREATED',
          details: `Admin ${flow.candidateName} (ID: ${flow.candidateUserId}) berhasil didaftarkan oleh Owner.`
        });

        return ctx.reply(
          `🎉 <b>ADMIN BERHASIL DIDAFTARKAN!</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Nama Admin: <b>${newAdmin.name}</b>\n` +
          `🆔 Telegram ID: <code>${newAdmin.telegram_user_id}</code>\n` +
          `🔑 Status: <b>Aktif</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `<i>Sampaikan password tersebut secara aman kepada Admin yang bersangkutan. Admin dapat login melalui menu /settings di Private Chat.</i>`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        ownerAdminCreationFlow.delete(flowKey);
        return ctx.reply(`❌ <b>Gagal mendaftarkan Admin:</b> ${err.message}`, { parse_mode: 'HTML' });
      }
    }

    return next();
  }
};

module.exports = AdminHandler;
