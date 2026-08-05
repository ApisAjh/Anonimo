const crypto = require('crypto');

/**
 * Hash IP address (+ sedikit salt dari user-agent) agar tidak menyimpan
 * data IP mentah di database, sambil tetap bisa dipakai untuk deteksi spam
 * dan pembatasan view per hari.
 */
function hashIp(ip, extra = '') {
  const raw = `${ip || 'unknown'}:${extra}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

module.exports = { hashIp, getClientIp };
