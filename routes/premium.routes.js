const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { syncPremiumStatus } = require('../middleware/premium');

/**
 * Paket Premium (simulasi — tanpa payment gateway).
 * plan id harus cocok dengan constraint di tabel premium.
 */
const PLANS = {
  monthly: {
    id: 'monthly',
    label: 'Bulanan',
    months: 1,
    price: 15000,
    priceLabel: 'Rp 15.000',
    description: 'Coba Premium selama 1 bulan'
  },
  '3month': {
    id: '3month',
    label: '3 Bulan',
    months: 3,
    price: 39000,
    priceLabel: 'Rp 39.000',
    description: 'Hemat 13% dibanding bulanan'
  },
  '6month': {
    id: '6month',
    label: '6 Bulan',
    months: 6,
    price: 72000,
    priceLabel: 'Rp 72.000',
    description: 'Hemat 20% dibanding bulanan'
  },
  yearly: {
    id: 'yearly',
    label: 'Tahunan',
    months: 12,
    price: 120000,
    priceLabel: 'Rp 120.000',
    description: 'Hemat 33% — nilai terbaik'
  }
};

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// GET /api/premium/plans — daftar paket (publik)
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: Object.values(PLANS).map((p) => ({
      id: p.id,
      label: p.label,
      months: p.months,
      price: p.price,
      priceLabel: p.priceLabel,
      description: p.description
    }))
  });
});

// GET /api/premium/bootstrap — 1 auth: status + plans + history
router.get('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Sync sekali, lalu history paralel dengan susunan response plans (in-memory)
    const { isPremium, subscription } = await syncPremiumStatus(userId);

    const { data: history } = await supabaseAdmin
      .from('premium')
      .select('id, plan, started_at, expires_at, is_active, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const plans = Object.values(PLANS).map((p) => ({
      id: p.id,
      label: p.label,
      months: p.months,
      price: p.price,
      priceLabel: p.priceLabel,
      description: p.description
    }));

    res.json({
      success: true,
      data: {
        isPremium,
        subscription: subscription
          ? {
              id: subscription.id,
              plan: subscription.plan,
              planLabel: PLANS[subscription.plan]?.label || subscription.plan,
              startedAt: subscription.started_at,
              expiresAt: subscription.expires_at,
              isActive: subscription.is_active
            }
          : null,
        history: history || [],
        plans
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/premium/status — status premium user yang login
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const { isPremium, subscription } = await syncPremiumStatus(req.user.id);

    const { data: history } = await supabaseAdmin
      .from('premium')
      .select('id, plan, started_at, expires_at, is_active, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      data: {
        isPremium,
        subscription: subscription
          ? {
              id: subscription.id,
              plan: subscription.plan,
              planLabel: PLANS[subscription.plan]?.label || subscription.plan,
              startedAt: subscription.started_at,
              expiresAt: subscription.expires_at,
              isActive: subscription.is_active
            }
          : null,
        history: history || []
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/premium/upgrade — simulasi upgrade (aktifkan premium)
router.post('/upgrade', requireAuth, async (req, res, next) => {
  try {
    const planId = req.body?.plan;
    const plan = PLANS[planId];

    if (!plan) {
      return res.status(400).json({
        success: false,
        error: 'Paket tidak valid. Pilih: monthly, 3month, 6month, atau yearly'
      });
    }

    // Sinkron dulu status lama
    const { isPremium, subscription: current } = await syncPremiumStatus(req.user.id);

    const now = new Date();
    // Jika masih aktif, perpanjang dari tanggal berakhir; jika tidak, mulai dari sekarang
    const startBase = isPremium && current?.expires_at
      ? new Date(current.expires_at)
      : now;
    const startedAt = isPremium && current?.expires_at ? new Date(current.started_at || current.startedAt || now) : now;
    const expiresAt = addMonths(startBase > now ? startBase : now, plan.months);

    // Nonaktifkan langganan aktif lama
    if (isPremium) {
      await supabaseAdmin
        .from('premium')
        .update({ is_active: false })
        .eq('user_id', req.user.id)
        .eq('is_active', true);
    }

    const { data: row, error } = await supabaseAdmin
      .from('premium')
      .insert({
        user_id: req.user.id,
        plan: plan.id,
        started_at: (isPremium ? startedAt : now).toISOString(),
        expires_at: expiresAt.toISOString(),
        is_active: true
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message || 'Gagal mengaktifkan Premium' });
    }

    await supabaseAdmin
      .from('profiles')
      .update({ is_premium: true })
      .eq('id', req.user.id);

    await supabaseAdmin.from('notifications').insert({
      user_id: req.user.id,
      type: 'system',
      content: `Premium ${plan.label} aktif sampai ${expiresAt.toLocaleDateString('id-ID')}`
    });

    res.status(201).json({
      success: true,
      message: `Premium ${plan.label} berhasil diaktifkan`,
      data: {
        isPremium: true,
        subscription: {
          id: row.id,
          plan: row.plan,
          planLabel: plan.label,
          startedAt: row.started_at,
          expiresAt: row.expires_at,
          isActive: true
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/premium/renew — perpanjang paket yang sama (atau pilih plan baru)
router.post('/renew', requireAuth, async (req, res, next) => {
  try {
    const { isPremium, subscription: current } = await syncPremiumStatus(req.user.id);

    if (!isPremium || !current) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada langganan aktif untuk diperpanjang. Gunakan /upgrade.'
      });
    }

    const planId = req.body?.plan || current.plan;
    const plan = PLANS[planId];
    if (!plan) {
      return res.status(400).json({ success: false, error: 'Paket tidak valid' });
    }

    // Delegasikan ke logika upgrade (perpanjang dari expires_at)
    req.body = { plan: planId };
    // Reuse upgrade handler body
    const now = new Date();
    const startBase = current.expires_at ? new Date(current.expires_at) : now;
    const expiresAt = addMonths(startBase > now ? startBase : now, plan.months);

    await supabaseAdmin
      .from('premium')
      .update({ is_active: false })
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    const { data: row, error } = await supabaseAdmin
      .from('premium')
      .insert({
        user_id: req.user.id,
        plan: plan.id,
        started_at: current.started_at,
        expires_at: expiresAt.toISOString(),
        is_active: true
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ success: false, error: error.message || 'Gagal memperpanjang Premium' });
    }

    await supabaseAdmin
      .from('profiles')
      .update({ is_premium: true })
      .eq('id', req.user.id);

    res.json({
      success: true,
      message: `Premium diperpanjang sampai ${expiresAt.toLocaleDateString('id-ID')}`,
      data: {
        isPremium: true,
        subscription: {
          id: row.id,
          plan: row.plan,
          planLabel: plan.label,
          startedAt: row.started_at,
          expiresAt: row.expires_at,
          isActive: true
        }
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/premium/cancel — batalkan langganan aktif (status free segera)
router.post('/cancel', requireAuth, async (req, res, next) => {
  try {
    const { isPremium } = await syncPremiumStatus(req.user.id);

    if (!isPremium) {
      return res.status(400).json({ success: false, error: 'Tidak ada langganan Premium aktif' });
    }

    await supabaseAdmin
      .from('premium')
      .update({ is_active: false })
      .eq('user_id', req.user.id)
      .eq('is_active', true);

    await supabaseAdmin
      .from('profiles')
      .update({ is_premium: false })
      .eq('id', req.user.id);

    // Reset tema premium
    const PREMIUM_THEMES = ['midnight', 'aurora', 'gold'];
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('theme')
      .eq('id', req.user.id)
      .single();

    if (profile && PREMIUM_THEMES.includes(profile.theme)) {
      await supabaseAdmin
        .from('profiles')
        .update({ theme: 'default' })
        .eq('id', req.user.id);
    }

    await supabaseAdmin.from('notifications').insert({
      user_id: req.user.id,
      type: 'system',
      content: 'Langganan Premium telah dibatalkan'
    });

    res.json({
      success: true,
      message: 'Langganan Premium dibatalkan. Akun kembali ke Free.',
      data: { isPremium: false, subscription: null }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
