const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { sendMessageLimiter } = require('../middleware/rateLimiter');
const { cleanText } = require('../utils/validators');
const { hashIp, getClientIp } = require('../utils/hash');
const { verifyCaptcha } = require('../utils/captcha');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Format gambar tidak didukung'));
    }
    cb(null, true);
  }
});

// POST /api/messages/:username — kirim pesan anonim ke seseorang (tanpa login)
router.post('/:username', sendMessageLimiter, upload.single('image'), async (req, res, next) => {
  try {
    const { username } = req.params;
    const senderName = cleanText(req.body?.senderName, 30) || 'Anonim';
    const content = cleanText(req.body?.content, 500);

    if (!content) {
      return res.status(400).json({ success: false, error: 'Pesan tidak boleh kosong' });
    }

    // Validasi captcha server-side (wajib, sekali pakai, berakhir otomatis)
    const captchaResult = verifyCaptcha(req.body?.captchaToken, req.body?.captchaAnswer);
    if (!captchaResult.valid) {
      return res.status(400).json({ success: false, error: captchaResult.error || 'Captcha tidak valid' });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, allow_images, is_private')
      .eq('username', username)
      .maybeSingle();

    if (profileError || !profile) {
      return res.status(404).json({ success: false, error: 'Pengguna tidak ditemukan' });
    }

    let imageUrl = null;
    if (req.file && profile.allow_images) {
      const fileName = `${profile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from('message-images')
        .upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

      if (!uploadError) {
        const { data: pub } = supabaseAdmin.storage.from('message-images').getPublicUrl(fileName);
        imageUrl = pub.publicUrl;
      }
    }

    const ipHash = hashIp(getClientIp(req), req.headers['user-agent'] || '');

    const { data: message, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        recipient_id: profile.id,
        sender_name: senderName,
        content,
        image_url: imageUrl,
        ip_hash: ipHash
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      return res.status(400).json({ success: false, error: 'Gagal mengirim pesan' });
    }

    await supabaseAdmin.from('notifications').insert({
      user_id: profile.id,
      type: 'new_message',
      content: 'Kamu menerima pesan anonim baru'
    });

    res.status(201).json({ success: true, message: 'Pesan berhasil dikirim', data: message });
  } catch (err) {
    next(err);
  }
});

// GET /api/messages — inbox milik user yang login, dengan pagination/search/filter
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const offset = (page - 1) * limit;
    const search = cleanText(req.query.search, 200);
    const filter = req.query.filter; // 'pinned' | 'favorite' | 'archived' | undefined

    let query = supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('recipient_id', req.user.id);

    if (filter === 'pinned') query = query.eq('is_pinned', true);
    else if (filter === 'favorite') query = query.eq('is_favorite', true);
    else if (filter === 'archived') query = query.eq('is_archived', true);
    else query = query.eq('is_archived', false);

    if (search) {
      query = query.ilike('content', `%${search}%`);
    }

    const { data, error, count } = await query
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal mengambil pesan' });
    }

    res.json({
      success: true,
      data,
      pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/messages/:id — update status pesan (pin/favorit/arsip/read)
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = ['is_pinned', 'is_favorite', 'is_archived', 'is_read'];
    const updates = {};

    for (const field of allowedFields) {
      if (typeof req.body?.[field] === 'boolean') updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada field valid untuk diperbarui' });
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .update(updates)
      .eq('id', id)
      .eq('recipient_id', req.user.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan' });
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/messages/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('messages')
      .delete()
      .eq('id', id)
      .eq('recipient_id', req.user.id);

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal menghapus pesan' });
    }

    res.json({ success: true, message: 'Pesan berhasil dihapus' });
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/stats — statistik ringkas untuk dashboard
router.get('/stats/summary', requireAuth, async (req, res, next) => {
  try {
    const { syncPremiumStatus } = require('../middleware/premium');
    const { isPremium } = await syncPremiumStatus(req.user.id);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('message_count, view_count, is_premium')
      .eq('id', req.user.id)
      .single();

    const { count: unreadCount } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', req.user.id)
      .eq('is_read', false);

    const data = {
      totalMessages: profile?.message_count || 0,
      totalViews: profile?.view_count || 0,
      unreadMessages: unreadCount || 0,
      isPremium
    };

    // Statistik mendalam khusus Premium
    if (isPremium) {
      const [pinned, favorite, archived] = await Promise.all([
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', req.user.id).eq('is_pinned', true),
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', req.user.id).eq('is_favorite', true),
        supabaseAdmin.from('messages').select('*', { count: 'exact', head: true }).eq('recipient_id', req.user.id).eq('is_archived', true)
      ]);
      data.premiumStats = {
        pinnedMessages: pinned.count || 0,
        favoriteMessages: favorite.count || 0,
        archivedMessages: archived.count || 0
      };
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
