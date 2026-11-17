/**
 * ASTEN! (ASISTEN TENAGA!) - License & Access Code API Routes
 */

const express = require('express');
const router = express.Router();
const LicenseModel = require('../../models/LicenseModel');
const LogModel = require('../../models/LogModel');

// Get all access codes
router.get('/codes', (req, res) => {
  try {
    const codes = LicenseModel.getAllCodes();
    const stats = LicenseModel.getStats();
    res.json({ success: true, data: codes, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate new access code: ASTEN-XXXX-XXXX-XXXX
router.post('/codes', (req, res) => {
  try {
    const { ownerName, telegramUsername, telegramUserId, licenseType, durationDays, maxBots, notes } = req.body;

    if (!ownerName || !licenseType) {
      return res.status(400).json({ success: false, message: 'Nama Owner dan Jenis Lisensi wajib diisi.' });
    }

    let days = parseInt(durationDays, 10) || 30;
    if (licenseType === '1_MONTH') days = 30;
    else if (licenseType === '3_MONTHS') days = 90;
    else if (licenseType === '6_MONTHS') days = 180;
    else if (licenseType === '1_YEAR') days = 365;
    else if (licenseType === '2_YEARS') days = 730;
    else if (licenseType === 'PERMANENT') days = 0;

    const accessCode = LicenseModel.createAccessCode({
      ownerName,
      telegramUsername,
      telegramUserId,
      licenseType,
      durationDays: days,
      maxBots: maxBots ? parseInt(maxBots, 10) : 1,
      notes: notes || ''
    });

    LogModel.log({
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'ACCESS_CODE_GENERATED',
      details: `Kode akses ${accessCode.code} dibuat untuk ${ownerName} (${licenseType}).`
    });

    res.json({
      success: true,
      message: 'Kode Akses ASTEN! berhasil dibuat!',
      data: accessCode
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Activate access code
router.post('/activate', async (req, res) => {
  try {
    const { code, telegramUserId, telegramUsername, password } = req.body;

    if (!code || !telegramUserId) {
      return res.status(400).json({ success: false, message: 'Kode akses dan Telegram User ID wajib diisi.' });
    }

    const result = await LicenseModel.activateCode(code, telegramUserId, telegramUsername, password);
    if (!result.success) {
      return res.status(400).json(result);
    }

    LogModel.log({
      ownerId: result.owner.id,
      actorType: 'OWNER',
      actorId: String(telegramUserId),
      action: 'ACCESS_CODE_ACTIVATED',
      details: `Kode akses ${code} berhasil diaktifkan oleh Telegram ID ${telegramUserId}.`
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
