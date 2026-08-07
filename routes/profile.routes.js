const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { cleanText } = require('../utils/validators');
const { hashIp, getClientIp } = require('../utils/hash');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Format gambar tidak didukung'));
    cb(null, true);
  }
});

// GET /api/profile/:username — profil publik + catat 1 view per IP per hari
router.get('/:username', async (req, res, next) => {
  try {
    const { username } = req.params;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, bio, avatar_url, banner_url, is_premium, theme, is_private, message_count, view_count, created_at')
      .eq('username', username)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan' });
    }

    const ipHash = hashIp(getClientIp(req), req.headers['user-agent'] || '');

    // View + cek blokir paralel (hemat latency)
    const [blockedRes] = await Promise.all([
      supabaseAdmin
        .from('blocked_senders')
        .select('id')
        .eq('user_id', profile.id)
        .eq('sender_hash', ipHash)
        .maybeSingle(),
      supabaseAdmin
        .from('views')
        .insert({ profile_id: profile.id, viewer_ip_hash: ipHash })
        .select()
        .maybeSingle()
    ]);
    const viewerBlocked = !!blockedRes.data;

    // Jangan bocorkan id internal ke klien publik
    const { id: _id, ...publicProfile } = profile;

    res.json({
      success: true,
      data: publicProfile,
      viewerBlocked
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/profile — update profil sendiri
router.patch('/', requireAuth, async (req, res, next) => {
  try {
    const allowedFields = ['display_name', 'bio', 'theme', 'allow_images', 'is_private'];
    const updates = {};

    if (typeof req.body?.display_name === 'string') updates.display_name = cleanText(req.body.display_name, 50);
    if (typeof req.body?.bio === 'string') updates.bio = cleanText(req.body.bio, 200);
    if (typeof req.body?.theme === 'string') updates.theme = cleanText(req.body.theme, 30);
    if (typeof req.body?.allow_images === 'boolean') updates.allow_images = req.body.allow_images;
    if (typeof req.body?.is_private === 'boolean') updates.is_private = req.body.is_private;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada field valid untuk diperbarui' });
    }

    // Tema premium hanya untuk pengguna Premium aktif
    if (updates.theme) {
      const PREMIUM_THEMES = ['midnight', 'aurora', 'gold'];
      if (PREMIUM_THEMES.includes(updates.theme)) {
        const { syncPremiumStatus } = require('../middleware/premium');
        const { isPremium } = await syncPremiumStatus(req.user.id);
        if (!isPremium) {
          return res.status(403).json({
            success: false,
            error: 'Tema ini khusus pengguna Premium',
            code: 'PREMIUM_REQUIRED'
          });
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memperbarui profil' });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/profile/avatar
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'File avatar wajib diunggah' });

    const fileName = `${req.user.id}/avatar-${Date.now()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('avatars')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) return res.status(400).json({ success: false, error: 'Gagal mengunggah avatar' });

    const { data: pub } = supabaseAdmin.storage.from('avatars').getPublicUrl(fileName);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, error: 'Gagal menyimpan avatar' });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/profile/banner
router.post('/banner', requireAuth, upload.single('banner'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'File banner wajib diunggah' });

    const fileName = `${req.user.id}/banner-${Date.now()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('banners')
      .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

    if (uploadError) return res.status(400).json({ success: false, error: 'Gagal mengunggah banner' });

    const { data: pub } = supabaseAdmin.storage.from('banners').getPublicUrl(fileName);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ banner_url: pub.publicUrl })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(400).json({ success: false, error: 'Gagal menyimpan banner' });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
