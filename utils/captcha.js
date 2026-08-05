const crypto = require('crypto');

const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 menit
const usedTokens = new Map(); // tokenHash -> expiresAt (anti-reuse, best-effort di serverless)

function getSecret() {
  return process.env.CAPTCHA_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || 'anonimo-captcha-dev-secret';
}

function cleanupUsed() {
  const now = Date.now();
  for (const [key, exp] of usedTokens) {
    if (exp < now) usedTokens.delete(key);
  }
}

/**
 * Generate soal matematika sederhana (penjumlahan / pengurangan).
 * Token ditandatangani HMAC agar validasi server-side tanpa DB.
 */
function generateCaptcha() {
  cleanupUsed();

  const ops = [
    () => {
      const a = 1 + Math.floor(Math.random() * 12);
      const b = 1 + Math.floor(Math.random() * 12);
      return { question: `${a} + ${b} = ?`, answer: a + b };
    },
    () => {
      const a = 5 + Math.floor(Math.random() * 15);
      const b = 1 + Math.floor(Math.random() * Math.min(a, 9));
      return { question: `${a} - ${b} = ?`, answer: a - b };
    },
    () => {
      const a = 1 + Math.floor(Math.random() * 9);
      const b = 1 + Math.floor(Math.random() * 9);
      return { question: `${a} × ${b} = ?`, answer: a * b };
    }
  ];

  const { question, answer } = ops[Math.floor(Math.random() * ops.length)]();
  const exp = Date.now() + CAPTCHA_TTL_MS;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${nonce}:${exp}:${answer}`;
  const token = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  // Kirim nonce+exp digabung dengan token agar server bisa verifikasi
  const captchaToken = Buffer.from(JSON.stringify({ n: nonce, e: exp, t: token })).toString('base64url');

  return {
    captchaToken,
    question,
    expiresIn: Math.floor(CAPTCHA_TTL_MS / 1000)
  };
}

/**
 * Validasi jawaban captcha. Token hanya boleh dipakai sekali.
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyCaptcha(captchaToken, userAnswer) {
  cleanupUsed();

  if (!captchaToken || userAnswer === undefined || userAnswer === null || userAnswer === '') {
    return { valid: false, error: 'Captcha wajib diisi' };
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(captchaToken, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, error: 'Captcha tidak valid' };
  }

  const { n: nonce, e: exp, t: token } = parsed || {};
  if (!nonce || !exp || !token) {
    return { valid: false, error: 'Captcha tidak valid' };
  }

  if (Date.now() > Number(exp)) {
    return { valid: false, error: 'Captcha sudah kedaluwarsa, muat ulang' };
  }

  const tokenHash = crypto.createHash('sha256').update(captchaToken).digest('hex');
  if (usedTokens.has(tokenHash)) {
    return { valid: false, error: 'Captcha sudah digunakan, muat ulang' };
  }

  const answerNum = Number(String(userAnswer).trim());
  if (!Number.isFinite(answerNum)) {
    return { valid: false, error: 'Jawaban captcha harus angka' };
  }

  const expectedPayload = `${nonce}:${exp}:${answerNum}`;
  const expectedToken = crypto.createHmac('sha256', getSecret()).update(expectedPayload).digest('hex');

  const a = Buffer.from(expectedToken);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, error: 'Jawaban captcha salah' };
  }

  // Tandai dipakai sampai masa kedaluwarsa
  usedTokens.set(tokenHash, Number(exp));
  return { valid: true };
}

module.exports = { generateCaptcha, verifyCaptcha };
