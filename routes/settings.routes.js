const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

// GET /api/settings/bootstrap — 1 auth: profil + settings + hidden words + blocked
router.get('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [profileRes, settingsRes, wordsRes, blockedRes] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, bio, avatar_url, banner_url, is_premium, theme, is_private, allow_images, message_count, view_count, created_at')
        .eq('id', userId)
        .single(),
      supabaseAdmin
        .from('settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      supabaseAdmin
        .from('hidden_words')
        .select('id, word, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('blocked_senders')
        .select('id, sender_hash, label, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ]);

    if (profileRes.error || !profileRes.data) {
      return res.status(404).json({ success: false, error: 'Profil tidak ditemukan' });
    }

    let settings = settingsRes.data;
    if (!settings) {
      const { data: created } = await supabaseAdmin
        .from('settings')
        .insert({ user_id: userId })
        .select()
        .single();
      settings = created;
    }

    const blocked = (blockedRes.data || []).map((row) => ({
      id: row.id,
      label: row.label || 'Anonim',
      fingerprint: `${(row.sender_hash || '').slice(0, 8)}…`,
      created_at: row.created_at
    }));

    const words = wordsRes.data || [];

    res.json({
      success: true,
      data: {
        user: { id: req.user.id, email: req.user.email },
        profile: profileRes.data,
        settings,
        hiddenWords: words,
        hiddenWordsMeta: { count: words.length, max: 100 },
        blocked
      }
    });
  } catch (err) {
    next(err);
  }
});


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
