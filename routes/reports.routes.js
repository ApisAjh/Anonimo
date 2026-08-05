const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { cleanText } = require('../utils/validators');
const { hashIp, getClientIp } = require('../utils/hash');

const VALID_REASONS = ['spam', 'harassment', 'sexual', 'violence', 'other'];

// POST /api/reports — laporkan sebuah pesan (dipakai pemilik inbox dari dashboard)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { messageId, reason, details } = req.body || {};

    if (!messageId || !VALID_REASONS.includes(reason)) {
      return res.status(400).json({ success: false, error: 'Data laporan tidak valid' });
    }

    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('id', messageId)
      .eq('recipient_id', req.user.id)
      .maybeSingle();

    if (!message) {
      return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan' });
    }

    const reporterHash = hashIp(getClientIp(req), req.user.id);

    const { error } = await supabaseAdmin.from('reports').insert({
      message_id: messageId,
      reporter_ip_hash: reporterHash,
      reason,
      details: cleanText(details, 300)
    });

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal mengirim laporan' });
    }

    res.status(201).json({ success: true, message: 'Laporan berhasil dikirim' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
