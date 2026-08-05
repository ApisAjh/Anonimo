const { supabaseAdmin } = require('../config/supabase');

/**
 * Middleware wajib login. Memverifikasi access token Supabase yang dikirim
 * lewat header Authorization: Bearer <token>. Tidak pernah membuat JWT sendiri.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, error: 'Token autentikasi tidak ditemukan' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ success: false, error: 'Sesi tidak valid atau sudah kedaluwarsa' });
    }

    req.user = data.user;
    req.accessToken = token;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Gagal memverifikasi sesi' });
  }
}

/**
 * Middleware opsional: jika ada token valid, isi req.user; jika tidak, lanjut sebagai tamu.
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      if (data?.user) {
        req.user = data.user;
        req.accessToken = token;
      }
    }
    next();
  } catch (err) {
    next();
  }
}

module.exports = { requireAuth, optionalAuth };
