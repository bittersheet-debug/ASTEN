/**
 * ASTEN! (ASISTEN TENAGA!) - License & Access Code Model
 */

const db = require('../database/db');
const { generateAccessCode } = require('../security/encryption');
const { CODE_STATUS } = require('../config/constants');
const OwnerModel = require('./OwnerModel');

const LicenseModel = {
  createAccessCode: ({ ownerName, telegramUsername, telegramUserId, licenseType, durationDays, maxBots = 1, notes = '' }) => {
    const code = generateAccessCode();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT INTO access_codes (
        code, owner_name, telegram_username, telegram_user_id,
        license_type, duration_days, max_bots, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      code,
      ownerName,
      telegramUsername || null,
      telegramUserId ? String(telegramUserId) : null,
      licenseType,
      durationDays,
      maxBots,
      CODE_STATUS.UNUSED,
      notes,
      now
    );

    return LicenseModel.findByCode(code);
  },

  findByCode: (code) => {
    if (!code) return null;
    return db.prepare('SELECT * FROM access_codes WHERE code = ?').get(code.trim().toUpperCase());
  },

  getAllCodes: () => {
    return db.prepare('SELECT * FROM access_codes ORDER BY created_at DESC').all();
  },

  /**
   * Activate Access Code:
   * When an Owner enters the access code, the license period begins AT ACTIVATION TIME!
   */
  activateCode: async (code, telegramUserId, telegramUsername = null, ownerPassword = null) => {
    const accessCode = LicenseModel.findByCode(code);
    if (!accessCode) {
      return { success: false, message: 'Kode akses tidak ditemukan atau salah format.' };
    }

    if (accessCode.status === CODE_STATUS.USED) {
      return { success: false, message: 'Kode akses ini sudah digunakan sebelumnya.' };
    }

    if (accessCode.status === CODE_STATUS.EXPIRED) {
      return { success: false, message: 'Kode akses ini sudah kedaluwarsa.' };
    }

    // Check if code was restricted to specific telegram user id
    if (accessCode.telegram_user_id && String(accessCode.telegram_user_id) !== String(telegramUserId)) {
      return { success: false, message: 'Kode akses ini terikat untuk akun Telegram tertentu.' };
    }

    // Check if owner already exists
    let owner = OwnerModel.findByTelegramUserId(telegramUserId);
    if (!owner) {
      // Create new owner
      owner = await OwnerModel.create({
        name: accessCode.owner_name,
        telegramUsername: telegramUsername || accessCode.telegram_username,
        telegramUserId: String(telegramUserId),
        password: ownerPassword,
        licenseType: accessCode.license_type,
        durationDays: accessCode.duration_days,
        maxBots: accessCode.max_bots
      });
    } else {
      // Extend existing owner
      if (accessCode.license_type === 'PERMANENT') {
        db.prepare("UPDATE owners SET license_type = 'PERMANENT', license_expires_at = NULL, status = 'ACTIVE', max_bots = max_bots + ?, updated_at = ? WHERE id = ?")
          .run(accessCode.max_bots, Date.now(), owner.id);
      } else {
        OwnerModel.extendLicense(owner.id, accessCode.duration_days);
        db.prepare('UPDATE owners SET max_bots = max_bots + ?, updated_at = ? WHERE id = ?')
          .run(accessCode.max_bots, Date.now(), owner.id);
      }
      owner = OwnerModel.findById(owner.id);
    }

    // Mark access code as USED
    db.prepare('UPDATE access_codes SET status = ?, used_at = ?, used_by_owner_id = ? WHERE id = ?')
      .run(CODE_STATUS.USED, Date.now(), owner.id, accessCode.id);

    return {
      success: true,
      message: 'Aktivasi lisensi Owner berhasil!',
      owner,
      accessCode
    };
  },

  getStats: () => {
    const total = db.prepare('SELECT COUNT(*) as count FROM access_codes').get().count;
    const unused = db.prepare("SELECT COUNT(*) as count FROM access_codes WHERE status = 'UNUSED'").get().count;
    const used = db.prepare("SELECT COUNT(*) as count FROM access_codes WHERE status = 'USED'").get().count;
    return { total, unused, used };
  }
};

module.exports = LicenseModel;
