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

  // Satu baca profil; update hanya jika perlu (hemat write)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_premium, theme')
    .eq('id', userId)
    .maybeSingle();

  const updates = {};
  if (profile && profile.is_premium !== isPremium) {
    updates.is_premium = isPremium;
  }
  if (!isPremium && profile) {
    const PREMIUM_THEMES = ['midnight', 'aurora', 'gold'];
    if (PREMIUM_THEMES.includes(profile.theme)) {
      updates.theme = 'default';
    }
  }
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('profiles').update(updates).eq('id', userId);
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


/**
 * Path cepat untuk LOAD halaman Premium.
 * Baca status dulu (paralel-friendly); tulis DB hanya jika benar-benar expired / drift flag.
 * Jangan dipakai untuk upgrade/cancel — tetap pakai syncPremiumStatus di sana.
 */
async function getPremiumStatusForPage(userId) {
  const now = new Date().toISOString();

  // 1 round-trip paralel: langganan aktif + flag profil
  const [activeRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from('premium')
      .select('id, plan, started_at, expires_at, is_active, user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('expires_at', { ascending: false, nullsFirst: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('is_premium, theme')
      .eq('id', userId)
      .maybeSingle()
  ]);

  let subscription = activeRes.data || null;
  let isPremium = false;

  if (subscription) {
    const expired = subscription.expires_at && subscription.expires_at <= now;
    if (expired) {
      await supabaseAdmin
        .from('premium')
        .update({ is_active: false })
        .eq('id', subscription.id);
      subscription = null;
      isPremium = false;
    } else {
      isPremium = true;
    }
  }

  const profile = profileRes.data;
  const updates = {};
  if (profile && profile.is_premium !== isPremium) {
    updates.is_premium = isPremium;
  }
  if (!isPremium && profile) {
    const PREMIUM_THEMES = ['midnight', 'aurora', 'gold'];
    if (PREMIUM_THEMES.includes(profile.theme)) {
      updates.theme = 'default';
    }
  }
  // Write hanya jika ada drift — kasus umum: 0 write
  if (Object.keys(updates).length > 0) {
    await supabaseAdmin.from('profiles').update(updates).eq('id', userId);
  }

  return { isPremium, subscription };
}

module.exports = { syncPremiumStatus, getPremiumStatusForPage, requirePremium, attachPremiumStatus };
