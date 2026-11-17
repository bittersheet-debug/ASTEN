/**
 * ASTEN! (ASISTEN TENAGA!) - Product & Stock API Routes
 */

const express = require('express');
const router = express.Router();
const ProductModel = require('../../models/ProductModel');

// Get products by bot ID
router.get('/bot/:botId', (req, res) => {
  try {
    const products = ProductModel.getAllByBotId(req.params.botId);
    const stats = ProductModel.getStats(req.params.botId);
    res.json({ success: true, data: products, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create product
router.post('/', (req, res) => {
  try {
    const { botId, name, category, description, price, stock, lowStockThreshold, photoUrl } = req.body;
    if (!botId || !name || price === undefined) {
      return res.status(400).json({ success: false, message: 'Bot ID, Nama, dan Harga wajib diisi.' });
    }

    const product = ProductModel.create({
      botId,
      name,
      category,
      description,
      price,
      stock,
      lowStockThreshold,
      photoUrl
    });

    res.json({ success: true, message: 'Produk berhasil ditambahkan.', data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Adjust stock
router.post('/:id/stock', (req, res) => {
  try {
    const { changeQty, reason, changedBy } = req.body;
    const result = ProductModel.adjustStock(
      req.params.id,
      parseInt(changeQty, 10),
      reason || 'Penyesuaian Manual Portal',
      changedBy || 'PORTAL_ADMIN'
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update product
router.put('/:id', (req, res) => {
  try {
    const updated = ProductModel.update(req.params.id, req.body);
    res.json({ success: true, message: 'Produk berhasil diperbarui.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete product
router.delete('/:id', (req, res) => {
  try {
    ProductModel.delete(req.params.id);
    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
