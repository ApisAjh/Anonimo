const express = require('express');
const router = express.Router();
const { generateCaptcha } = require('../utils/captcha');
const rateLimit = require('express-rate-limit');

const captchaLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak permintaan captcha. Coba lagi sebentar.' }
});

// GET /api/captcha — generate soal captcha baru
router.get('/', captchaLimiter, (req, res) => {
  const captcha = generateCaptcha();
  res.json({
    success: true,
    data: captcha
  });
});

module.exports = router;
