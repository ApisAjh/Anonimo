const rateLimit = require('express-rate-limit');

// Rate limit umum untuk seluruh API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.' }
});

// Rate limit ketat khusus untuk kirim pesan (anti-spam)
const sendMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Kamu mengirim pesan terlalu cepat. Tunggu sebentar ya.' }
});

// Rate limit untuk auth (login/register) — mencegah brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }
});

module.exports = { generalLimiter, sendMessageLimiter, authLimiter };
