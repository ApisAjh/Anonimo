const express = require('express');
const router = express.Router();
const { supabasePublic, supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { isValidUsername, isValidEmail, isValidPassword } = require('../utils/validators');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

/**
 * Normalisasi email: trim + lowercase.
 * Supabase menyimpan email dalam bentuk lowercase; inkonsistensi
 * spasi/kapital di input sering membuat login gagal.
 */
function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Petakan error Supabase Auth ke pesan yang jelas (bukan selalu "password salah").
 */
function mapAuthError(error) {
  const msg = (error?.message || '').toLowerCase();
  const status = error?.status || error?.statusCode;

  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return {
      status: 403,
      error: 'Email belum diverifikasi. Cek kotak masuk (atau spam) dan klik tautan konfirmasi.'
    };
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return { status: 401, error: 'Email atau password salah' };
  }
  if (msg.includes('user banned') || msg.includes('banned')) {
    return { status: 403, error: 'Akun ini telah dinonaktifkan' };
  }
  if (msg.includes('too many') || status === 429) {
    return { status: 429, error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' };
  }

  // Fallback: jangan sembunyikan total — log di server, pesan generik ke client
  return {
    status: 401,
    error: error?.message || 'Gagal masuk. Periksa email dan password.'
  };
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim().toLowerCase()
      : '';
    const displayName = typeof req.body?.displayName === 'string'
      ? req.body.displayName.trim()
      : '';

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
        emailRedirectTo: `${APP_URL.replace(/\/$/, '')}/login`
      }
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[auth/register]', error.message);
      return res.status(400).json({ success: false, error: error.message });
    }

    // Kasus edge: user object palsu (obfuscated) saat email sudah terdaftar + confirm aktif
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Email sudah terdaftar. Silakan masuk atau reset password.'
      });
    }

    const needsConfirm = !data.session;
    res.status(201).json({
      success: true,
      message: needsConfirm
        ? 'Registrasi berhasil. Silakan cek email untuk verifikasi.'
        : 'Registrasi berhasil. Kamu bisa langsung masuk.',
      user: { id: data.user?.id, email: data.user?.email },
      emailConfirmationRequired: needsConfirm
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ success: false, error: 'Email dan password wajib diisi' });
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[auth/login]', {
        email,
        message: error.message,
        status: error.status || error.statusCode,
        code: error.code
      });
      const mapped = mapAuthError(error);
      return res.status(mapped.status).json({ success: false, error: mapped.error });
    }

    if (!data?.session || !data?.user) {
      // eslint-disable-next-line no-console
      console.warn('[auth/login] no session returned', { email, hasUser: !!data?.user });
      return res.status(403).json({
        success: false,
        error: 'Email belum diverifikasi atau sesi tidak dapat dibuat. Cek email konfirmasi.'
      });
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
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Email tidak valid' });
    }

    // Redirect ke halaman reset; APP_URL harus cocok dengan URL yang diizinkan di Supabase Auth
    const redirectTo = `${APP_URL.replace(/\/$/, '')}/reset-password`;

    const { error } = await supabasePublic.auth.resetPasswordForEmail(email, { redirectTo });

    // Jangan bocorkan apakah email terdaftar — selalu balas sukses
    // (error Supabase tetap dilog di server, client tetap dapat pesan generik)
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[forgot-password]', error.message);
    }

    res.json({
      success: true,
      message: 'Jika email terdaftar, tautan reset password telah dikirim. Periksa kotak masuk atau folder spam.'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — recovery session (dari email) ATAU user yang sudah login
router.post('/reset-password', requireAuth, async (req, res, next) => {
  try {
    const { newPassword } = req.body || {};
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ success: false, error: 'Password baru minimal 8 karakter' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user.id, {
      password: newPassword
    });

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
    if (error || !data?.session?.access_token) {
      // eslint-disable-next-line no-console
      console.warn('[auth/refresh]', error?.message || 'no session');
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
