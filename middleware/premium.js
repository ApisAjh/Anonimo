const { supabaseAdmin } = require('../config/supabase');

/**
 * Sinkronkan status premium: jika langganan aktif sudah lewat expires_at,
 * nonaktifkan baris premium dan set profiles.is_premium = false.
 * Mengembalikan status premium terkini + baris premium aktif (jika ada).
 */
async function syncPremiumStatus(userId) {
  const now = new Date().toISOString();

  // Nonaktifkan semua langganan yang sudah kadaluarsa
  await supabaseAdmin
    .from('premium')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('expires_at', now);

  const { data: active } = await supabaseAdmin
    .from('premium')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('expires_at', { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  const isPremium = !!active;

  await supabaseAdmin
    .from('profiles')
    .update({ is_premium: isPremium })
    .eq('id', userId);

  // Jika bukan premium dan tema premium masih terpasang, kembalikan ke default
  if (!isPremium) {
    const PREMIUM_THEMES = ['midnight', 'aurora', 'gold'];
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('theme')
      .eq('id', userId)
      .single();

    if (profile && PREMIUM_THEMES.includes(profile.theme)) {
      await supabaseAdmin
        .from('profiles')
        .update({ theme: 'default' })
        .eq('id', userId);
    }
  }

  return { isPremium, subscription: active || null };
}

/**
 * Middleware: wajib login + status premium aktif (auto-expire dulu).
 */
async function requirePremium(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Token autentikasi tidak ditemukan' });
    }

    const { isPremium, subscription } = await syncPremiumStatus(req.user.id);

    if (!isPremium) {
      return res.status(403).json({
        success: false,
        error: 'Fitur ini khusus pengguna Premium',
        code: 'PREMIUM_REQUIRED'
      });
    }

    req.isPremium = true;
    req.premiumSubscription = subscription;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Gagal memverifikasi status Premium' });
  }
}

/**
 * Middleware opsional: isi req.isPremium setelah sync, tanpa memblokir.
 * Harus dipanggil setelah requireAuth.
 */
async function attachPremiumStatus(req, res, next) {
  try {
    if (req.user?.id) {
      const { isPremium, subscription } = await syncPremiumStatus(req.user.id);
      req.isPremium = isPremium;
      req.premiumSubscription = subscription;
    } else {
      req.isPremium = false;
      req.premiumSubscription = null;
    }
    next();
  } catch (err) {
    req.isPremium = false;
    req.premiumSubscription = null;
    next();
  }
}

module.exports = { syncPremiumStatus, requirePremium, attachPremiumStatus };
