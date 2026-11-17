/**
 * ASTEN! (ASISTEN TENAGA!) - RNK API Routes
 */

const express = require('express');
const router = express.Router();
const RnkModel = require('../../models/RnkModel');

// Get RNK config & records by bot ID
router.get('/bot/:botId', (req, res) => {
  try {
    const config = RnkModel.getConfig(req.params.botId);
    const records = RnkModel.getAllRecordsByBotId(req.params.botId, 50);
    const stats = RnkModel.getStats(req.params.botId);
    res.json({ success: true, config, records, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update RNK config
router.post('/bot/:botId/config', (req, res) => {
  try {
    const updated = RnkModel.updateConfig(req.params.botId, req.body);
    res.json({ success: true, message: 'Konfigurasi RNK berhasil disimpan.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
