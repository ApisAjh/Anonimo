const express = require('express');
const router = express.Router();
const { supabasePublic, supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { isValidUsername, isValidEmail, isValidPassword } = require('../utils/validators');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password, username, displayName } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Email tidak valid' });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ success: false, error: 'Password minimal 8 karakter' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ success: false, error: 'Username harus 3-20 karakter, huruf kecil/angka/underscore' });
    }

    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Username sudah digunakan' });
    }

    const { data, error } = await supabasePublic.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName || username },
        emailRedirectTo: `${APP_URL}/login`
      }
    });

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil. Silakan cek email untuk verifikasi.',
      user: { id: data.user?.id, email: data.user?.email }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ success: false, error: 'Email atau password salah' });
    }

    res.json({
      success: true,
      session: data.session,
      user: { id: data.user.id, email: data.user.email }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await supabaseAdmin.auth.admin.signOut(req.accessToken);
    res.json({ success: true, message: 'Berhasil logout' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout-all — logout dari semua device
router.post('/logout-all', requireAuth, async (req, res, next) => {
  try {
    await supabaseAdmin.auth.admin.signOut(req.user.id, 'global');
    res.json({ success: true, message: 'Berhasil logout dari semua perangkat' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Email tidak valid' });
    }

    await supabasePublic.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/reset-password`
    });

    // Selalu balas sukses (tidak membocorkan apakah email terdaftar)
    res.json({ success: true, message: 'Jika email terdaftar, tautan reset password telah dikirim.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — dipanggil setelah user klik link reset (sudah punya session sementara)
router.post('/reset-password', requireAuth, async (req, res, next) => {
  try {
    const { newPassword } = req.body || {};
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ success: false, error: 'Password baru minimal 8 karakter' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, { password: newPassword });
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({ success: true, message: 'Password berhasil diperbarui' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — refresh session menggunakan refresh_token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'refreshToken wajib diisi' });
    }

    const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      return res.status(401).json({ success: false, error: 'Sesi tidak dapat diperbarui, silakan login ulang' });
    }

    res.json({ success: true, session: data.session });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — data user yang sedang login (protected route)
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    // Auto-expire premium jika sudah lewat, supaya is_premium selalu akurat
    const { syncPremiumStatus } = require('../middleware/premium');
    await syncPremiumStatus(req.user.id);

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      return res.status(404).json({ success: false, error: 'Profil tidak ditemukan' });
    }

    res.json({ success: true, user: { id: req.user.id, email: req.user.email }, profile: data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/account — hapus akun permanen
router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user.id);
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    // profiles, messages, dll terhapus otomatis lewat ON DELETE CASCADE
    res.json({ success: true, message: 'Akun berhasil dihapus' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
