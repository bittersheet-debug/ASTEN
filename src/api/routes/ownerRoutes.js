/**
 * ASTEN! (ASISTEN TENAGA!) - Owner Management API Routes
 */

const express = require('express');
const router = express.Router();
const OwnerModel = require('../../models/OwnerModel');
const LogModel = require('../../models/LogModel');

// Get all owners
router.get('/', (req, res) => {
  try {
    const owners = OwnerModel.getAll();
    res.json({ success: true, data: owners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create new owner manually
router.post('/', async (req, res) => {
  try {
    const { name, telegramUsername, telegramUserId, password, licenseType, durationDays, maxBots } = req.body;
    if (!name || !licenseType) {
      return res.status(400).json({ success: false, message: 'Nama dan Jenis Lisensi wajib diisi.' });
    }

    const owner = await OwnerModel.create({
      name,
      telegramUsername,
      telegramUserId,
      password: password || '123456',
      licenseType,
      durationDays: durationDays ? parseInt(durationDays, 10) : 30,
      maxBots: maxBots ? parseInt(maxBots, 10) : 1
    });

    LogModel.log({
      ownerId: owner.id,
      actorType: 'PORTAL',
      actorId: 'ADMIN_PORTAL',
      action: 'OWNER_CREATED',
      details: `Owner ${owner.name} berhasil ditambahkan melalui Portal ASTEN!.`
    });

    res.json({ success: true, message: 'Owner berhasil ditambahkan.', data: owner });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle status (ACTIVE / SUSPENDED)
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    OwnerModel.updateStatus(req.params.id, status);
    res.json({ success: true, message: `Status Owner diperbarui menjadi ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Extend license
router.post('/:id/extend', (req, res) => {
  try {
    const { days } = req.body;
    const additionalDays = parseInt(days, 10) || 30;
    const updated = OwnerModel.extendLicense(req.params.id, additionalDays);
    res.json({ success: true, message: `Lisensi Owner berhasil diperpanjang ${additionalDays} hari.`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reset password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ success: false, message: 'Password baru wajib diisi.' });
    await OwnerModel.updatePassword(req.params.id, newPassword);
    res.json({ success: true, message: 'Password Owner berhasil direset.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete owner
router.delete('/:id', (req, res) => {
  try {
    OwnerModel.delete(req.params.id);
    res.json({ success: true, message: 'Owner berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
