/**
 * Hidden Words + Block Anonymous Sender
 * Semua endpoint butuh login (recipient).
 */
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { cleanText } = require('../utils/validators');

const MAX_HIDDEN_WORDS = 100;
const WORD_RE = /^[\p{L}\p{N}_\-'.]+$/u;

function normalizeWord(raw) {
  const w = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return w.slice(0, 40);
}

// ---------- Hidden Words ----------

// GET /api/moderation/hidden-words
router.get('/hidden-words', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('hidden_words')
      .select('id, word, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memuat hidden words' });
    }

    res.json({
      success: true,
      data: data || [],
      meta: { count: (data || []).length, max: MAX_HIDDEN_WORDS }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/moderation/hidden-words  { word }
router.post('/hidden-words', requireAuth, async (req, res, next) => {
  try {
    const word = normalizeWord(req.body?.word);
    if (!word || word.length < 1) {
      return res.status(400).json({ success: false, error: 'Kata wajib diisi' });
    }
    if (word.length > 40) {
      return res.status(400).json({ success: false, error: 'Kata maksimal 40 karakter' });
    }
    if (!WORD_RE.test(word.replace(/\s/g, ''))) {
      // izinkan spasi antar kata frasa pendek
      const okPhrase = /^[\p{L}\p{N}_\-'.\s]+$/u.test(word);
      if (!okPhrase) {
        return res.status(400).json({ success: false, error: 'Kata mengandung karakter tidak valid' });
      }
    }

    const { count } = await supabaseAdmin
      .from('hidden_words')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if ((count || 0) >= MAX_HIDDEN_WORDS) {
      return res.status(400).json({
        success: false,
        error: `Maksimal ${MAX_HIDDEN_WORDS} kata tersembunyi`
      });
    }

    const { data, error } = await supabaseAdmin
      .from('hidden_words')
      .insert({ user_id: req.user.id, word })
      .select('id, word, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'Kata sudah ada di daftar' });
      }
      return res.status(400).json({ success: false, error: 'Gagal menambahkan kata' });
    }

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/moderation/hidden-words/:id
router.delete('/hidden-words/:id', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('hidden_words')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal menghapus kata' });
    }
    res.json({ success: true, message: 'Kata dihapus' });
  } catch (err) {
    next(err);
  }
});

// ---------- Blocked Senders ----------

// GET /api/moderation/blocked
router.get('/blocked', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('blocked_senders')
      .select('id, sender_hash, label, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memuat daftar blokir' });
    }

    // Jangan bocorkan hash penuh ke klien — tampilkan potongan aman
    const safe = (data || []).map((row) => ({
      id: row.id,
      label: row.label || 'Anonim',
      fingerprint: `${(row.sender_hash || '').slice(0, 8)}…`,
      created_at: row.created_at
    }));

    res.json({ success: true, data: safe });
  } catch (err) {
    next(err);
  }
});

// POST /api/moderation/block  { messageId }
// Blokir pengirim berdasarkan ip_hash pesan di inbox user
router.post('/block', requireAuth, async (req, res, next) => {
  try {
    const messageId = cleanText(req.body?.messageId, 64);
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'messageId wajib diisi' });
    }

    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('messages')
      .select('id, recipient_id, sender_name, ip_hash')
      .eq('id', messageId)
      .eq('recipient_id', req.user.id)
      .maybeSingle();

    if (msgErr || !msg) {
      return res.status(404).json({ success: false, error: 'Pesan tidak ditemukan' });
    }
    if (!msg.ip_hash) {
      return res.status(400).json({
        success: false,
        error: 'Pesan ini tidak punya identitas pengirim yang bisa diblokir'
      });
    }

    const label = cleanText(msg.sender_name, 30) || 'Anonim';

    const { data, error } = await supabaseAdmin
      .from('blocked_senders')
      .upsert(
        {
          user_id: req.user.id,
          sender_hash: msg.ip_hash,
          label
        },
        { onConflict: 'user_id,sender_hash' }
      )
      .select('id, label, created_at')
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal memblokir pengirim' });
    }

    res.status(201).json({
      success: true,
      message: 'Pengirim diblokir. Pesan dari identitas ini tidak akan masuk inbox.',
      data: {
        id: data.id,
        label: data.label,
        created_at: data.created_at
      }
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/moderation/blocked/:id
router.delete('/blocked/:id', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('blocked_senders')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) {
      return res.status(400).json({ success: false, error: 'Gagal membuka blokir' });
    }
    res.json({ success: true, message: 'Blokir dicabut' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
