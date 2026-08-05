const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/settings — ambil preferensi milik user yang login
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memuat pengaturan' });
    }

    // Jika belum ada row settings (edge case), buat default
    if (!data) {
      const { data: created } = await supabaseAdmin
        .from('settings')
        .insert({ user_id: req.user.id })
        .select()
        .single();
      return res.json({ success: true, data: created });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/settings
router.patch('/', requireAuth, async (req, res, next) => {
  try {
    const allowedFields = ['email_notifications', 'push_notifications', 'show_view_count'];
    const updates = {};

    for (const field of allowedFields) {
      if (typeof req.body?.[field] === 'boolean') updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada field valid untuk diperbarui' });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('settings')
      .update(updates)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memperbarui pengaturan' });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
