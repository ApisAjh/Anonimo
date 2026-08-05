// ============================================================
// premium.js — halaman upgrade & kelola Premium
// ============================================================

const session = requireLoginOrRedirect();

let currentStatus = null;

async function init() {
  if (!session) return;
  await Promise.all([loadStatus(), loadPlans()]);
}

async function loadStatus() {
  const { ok, data } = await apiFetch('/premium/status');
  if (!ok) {
    document.getElementById('status-text').textContent = 'Gagal memuat status Premium';
    return;
  }

  currentStatus = data.data;
  const badge = document.getElementById('status-badge');
  const text = document.getElementById('status-text');
  const meta = document.getElementById('status-meta');
  const actions = document.getElementById('status-actions');

  if (currentStatus.isPremium && currentStatus.subscription) {
    const sub = currentStatus.subscription;
    badge.textContent = '✨ Premium Aktif';
    badge.className = 'status-badge active';
    text.textContent = `Kamu sedang menikmati paket ${sub.planLabel || sub.plan}.`;
    meta.style.display = 'flex';
    meta.innerHTML = `
      <span>Mulai: <strong>${formatDate(sub.startedAt)}</strong></span>
      <span>Berakhir: <strong>${formatDate(sub.expiresAt)}</strong></span>
    `;
    actions.style.display = 'flex';
  } else {
    badge.textContent = 'Free';
    badge.className = 'status-badge free';
    text.textContent = 'Upgrade untuk membuka tema eksklusif, badge, dan statistik premium.';
    meta.style.display = 'none';
    actions.style.display = 'none';
  }

  renderHistory(currentStatus.history || []);
}

function renderHistory(history) {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  if (!history.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = history.map((h) => `
    <div class="history-item">
      <span class="plan-name">${escapeHtml(planLabel(h.plan))}</span>
      <span class="dates">${formatDate(h.started_at)} → ${h.expires_at ? formatDate(h.expires_at) : '—'}</span>
      <span class="tag ${h.is_active ? 'active' : 'inactive'}">${h.is_active ? 'Aktif' : 'Selesai'}</span>
    </div>
  `).join('');
}

async function loadPlans() {
  const { ok, data } = await apiFetch('/premium/plans');
  const grid = document.getElementById('plans-grid');

  if (!ok || !data.data) {
    grid.innerHTML = '<p style="color:var(--text-secondary)">Gagal memuat paket.</p>';
    return;
  }

  const plans = data.data;
  grid.innerHTML = '';

  plans.forEach((plan, idx) => {
    const featured = plan.id === 'yearly';
    const card = document.createElement('div');
    card.className = `glass plan-card ${featured ? 'featured' : ''}`;
    card.innerHTML = `
      <div class="plan-label">${escapeHtml(plan.label)}</div>
      <div class="plan-price">${escapeHtml(plan.priceLabel)} <span>/ ${plan.months} bln</span></div>
      <div class="plan-desc">${escapeHtml(plan.description)}</div>
      <button class="btn btn-primary" data-plan="${plan.id}">
        ${currentStatus?.isPremium ? 'Upgrade / Perpanjang' : 'Aktifkan'}
      </button>
    `;
    card.querySelector('button').addEventListener('click', () => upgrade(plan.id, plan.label));
    grid.appendChild(card);
  });
}

async function upgrade(planId, planLabel) {
  if (!confirm(`Aktifkan paket ${planLabel}? (Simulasi — tanpa pembayaran)`)) return;

  const { ok, data } = await apiFetch('/premium/upgrade', {
    method: 'POST',
    body: JSON.stringify({ plan: planId })
  });

  if (!ok) {
    showToast(data.error || 'Gagal mengaktifkan Premium', 'error');
    return;
  }

  showToast(data.message || 'Premium aktif!', 'success');
  await loadStatus();
  await loadPlans();
}

document.getElementById('renew-btn')?.addEventListener('click', async () => {
  if (!currentStatus?.subscription) return;
  const planId = currentStatus.subscription.plan;
  if (!confirm('Perpanjang paket yang sama?')) return;

  const { ok, data } = await apiFetch('/premium/renew', {
    method: 'POST',
    body: JSON.stringify({ plan: planId })
  });

  if (!ok) {
    showToast(data.error || 'Gagal memperpanjang', 'error');
    return;
  }
  showToast(data.message || 'Berhasil diperpanjang', 'success');
  await loadStatus();
});

document.getElementById('cancel-btn')?.addEventListener('click', async () => {
  if (!confirm('Batalkan Premium sekarang? Tema eksklusif akan dikunci kembali.')) return;

  const { ok, data } = await apiFetch('/premium/cancel', { method: 'POST' });
  if (!ok) {
    showToast(data.error || 'Gagal membatalkan', 'error');
    return;
  }
  showToast(data.message || 'Premium dibatalkan', 'success');
  await loadStatus();
  await loadPlans();
});

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function planLabel(id) {
  const map = { monthly: 'Bulanan', '3month': '3 Bulan', '6month': '6 Bulan', yearly: 'Tahunan', lifetime: 'Lifetime' };
  return map[id] || id;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

init();
