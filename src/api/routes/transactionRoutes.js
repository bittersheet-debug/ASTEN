/**
 * ASTEN! (ASISTEN TENAGA!) - Transaction Management API Routes
 */

const express = require('express');
const router = express.Router();
const TransactionModel = require('../../models/TransactionModel');

// Get transactions by bot ID
router.get('/bot/:botId', (req, res) => {
  try {
    const transactions = TransactionModel.getAllByBotId(req.params.botId, 100);
    const stats = TransactionModel.getStats(req.params.botId);
    res.json({ success: true, data: transactions, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Manual verify transaction via portal
router.post('/:txId/verify', (req, res) => {
  try {
    const { verifiedBy } = req.body;
    const result = TransactionModel.verifyAndComplete(req.params.txId, verifiedBy || 'PORTAL_SUPERADMIN');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cancel transaction
router.post('/:txId/cancel', (req, res) => {
  try {
    const { cancelledBy } = req.body;
    const result = TransactionModel.cancel(req.params.txId, cancelledBy || 'PORTAL_SUPERADMIN');
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
