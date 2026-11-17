/**
 * ASTEN! (ASISTEN TENAGA!) - Auth Routes for Web Portal
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const config = require('../../config/config');

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Password wajib diisi.' });
  }

  if (password !== config.PORTAL_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Password portal salah.' });
  }

  const token = jwt.sign(
    { role: 'PORTAL_SUPERADMIN', loggedInAt: Date.now() },
    config.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    success: true,
    message: 'Login berhasil! Selamat datang di Portal Pemilik Bot ASTEN!.',
    token
  });
});

module.exports = router;
