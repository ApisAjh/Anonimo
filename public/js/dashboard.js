// ============================================================
// dashboard.js — logika halaman dashboard/inbox
// ============================================================

const session = requireLoginOrRedirect();

let state = {
  page: 1,
  filter: '',
  search: '',
  totalPages: 1
};
let searchDebounce = null;
let reportTargetId = null;

async function init() {
  if (!session) return;
  await Promise.all([loadProfilePill(), loadStats()]);
  await loadMessages();
}

async function loadProfilePill() {
  const { ok, data } = await apiFetch('/auth/me');
  if (ok && data.profile) {
    const pill = document.getElementById('profile-link-pill');
    const host = window.location.host;
    const link = `${window.location.origin}/u/${data.profile.username}`;
    pill.textContent = `🔗 ${host}/u/${data.profile.username}`;
    pill.title = 'Klik untuk menyalin link profilmu';
    pill.addEventListener('click', () => {
      navigator.clipboard.writeText(link);
      showToast('Link profil disalin!', 'success');
    });
  }
}

async function loadStats() {
  const { ok, data } = await apiFetch('/messages/stats/summary');
  if (ok) {
    document.getElementById('stat-total').textContent = data.data.totalMessages;
    document.getElementById('stat-views').textContent = data.data.totalViews;
    document.getElementById('stat-unread').textContent = data.data.unreadMessages;
    document.querySelectorAll('.skeleton-text').forEach((el) => el.classList.remove('skeleton-text'));
  }
}

async function loadMessages() {
  const listEl = document.getElementById('message-list');
  const emptyEl = document.getElementById('empty-state');
  listEl.innerHTML = `
    <div class="glass message-skeleton"></div>
    <div class="glass message-skeleton"></div>
    <div class="glass message-skeleton"></div>
  `;
  emptyEl.style.display = 'none';

  const params = new URLSearchParams({ page: state.page, limit: 10 });
  if (state.filter) params.set('filter', state.filter);
  if (state.search) params.set('search', state.search);

  const { ok, data } = await apiFetch(`/messages?${params.toString()}`);

  if (!ok) {
    listEl.innerHTML = '';
    showToast(data.error || 'Gagal memuat pesan', 'error');
    return;
  }

  state.totalPages = data.pagination.totalPages || 1;
  renderMessages(data.data || []);
  renderPagination();
}

function renderMessages(messages) {
  const listEl = document.getElementById('message-list');
  const emptyEl = document.getElementById('empty-state');
  listEl.innerHTML = '';

  if (messages.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }

  messages.forEach((msg) => {
    const card = document.createElement('div');
    card.className = `glass message-card ${msg.is_pinned ? 'pinned' : ''} ${!msg.is_read ? 'unread' : ''}`;
    card.innerHTML = `
      <div class="message-top">
        <div class="message-sender">${msg.is_pinned ? '📌 ' : ''}${escapeHtml(msg.sender_name || 'Anonim')}</div>
        <div class="message-time">${formatTime(msg.created_at)}</div>
      </div>
      <div class="message-content">${escapeHtml(msg.content)}</div>
      ${msg.image_url ? `<img class="message-image" src="${msg.image_url}" alt="Lampiran pesan" loading="lazy" />` : ''}
      <div class="message-actions">
        <button class="msg-action-btn ${msg.is_pinned ? 'active' : ''}" data-action="pin">📌 ${msg.is_pinned ? 'Lepas Pin' : 'Pin'}</button>
        <button class="msg-action-btn ${msg.is_favorite ? 'active' : ''}" data-action="favorite">⭐ ${msg.is_favorite ? 'Batal Favorit' : 'Favorit'}</button>
        <button class="msg-action-btn" data-action="archive">${msg.is_archived ? '↩️ Batalkan Arsip' : '🗄️ Arsipkan'}</button>
        <button class="msg-action-btn" data-action="report">🚩 Lapor</button>
        <button class="msg-action-btn danger" data-action="delete">🗑️ Hapus</button>
      </div>
    `;

    if (!msg.is_read) {
      apiFetch(`/messages/${msg.id}`, { method: 'PATCH', body: JSON.stringify({ is_read: true }) });
    }

    card.querySelector('[data-action="pin"]').addEventListener('click', () => toggleField(msg.id, 'is_pinned', !msg.is_pinned));
    card.querySelector('[data-action="favorite"]').addEventListener('click', () => toggleField(msg.id, 'is_favorite', !msg.is_favorite));
    card.querySelector('[data-action="archive"]').addEventListener('click', () => toggleField(msg.id, 'is_archived', !msg.is_archived));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteMessage(msg.id));
    card.querySelector('[data-action="report"]').addEventListener('click', () => openReportModal(msg.id));

    listEl.appendChild(card);
  });
}

async function toggleField(id, field, value) {
  const { ok, data } = await apiFetch(`/messages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ [field]: value })
  });
  if (!ok) {
    showToast(data.error || 'Gagal memperbarui pesan', 'error');
    return;
  }
  loadMessages();
}

async function deleteMessage(id) {
  if (!confirm('Hapus pesan ini secara permanen?')) return;
  const { ok, data } = await apiFetch(`/messages/${id}`, { method: 'DELETE' });
  if (!ok) {
    showToast(data.error || 'Gagal menghapus pesan', 'error');
    return;
  }
  showToast('Pesan dihapus', 'success');
  loadMessages();
  loadStats();
}

function openReportModal(id) {
  reportTargetId = id;
  document.getElementById('report-modal-overlay').classList.add('open');
}

function closeReportModal() {
  reportTargetId = null;
  document.getElementById('report-modal-overlay').classList.remove('open');
}

function renderPagination() {
  const el = document.getElementById('pagination');
  el.innerHTML = '';
  if (state.totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = 'page-btn';
  prevBtn.textContent = '‹';
  prevBtn.disabled = state.page <= 1;
  prevBtn.addEventListener('click', () => { state.page--; loadMessages(); });

  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Halaman ${state.page} dari ${state.totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'page-btn';
  nextBtn.textContent = '›';
  nextBtn.disabled = state.page >= state.totalPages;
  nextBtn.addEventListener('click', () => { state.page++; loadMessages(); });

  el.append(prevBtn, info, nextBtn);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatTime(iso) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} jam lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Event bindings ----------
document.getElementById('search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.search = e.target.value.trim();
    state.page = 1;
    loadMessages();
  }, 400);
});

document.getElementById('filter-tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-tab');
  if (!btn) return;
  document.querySelectorAll('.filter-tab').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  state.filter = btn.dataset.filter;
  state.page = 1;
  loadMessages();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiFetch('/auth/logout', { method: 'POST' });
  clearSession();
  window.location.href = '/login.html';
});

document.getElementById('report-cancel').addEventListener('click', closeReportModal);
document.getElementById('report-confirm').addEventListener('click', async () => {
  if (!reportTargetId) return;
  const reason = document.getElementById('report-reason').value;
  const { ok, data } = await apiFetch('/reports', {
    method: 'POST',
    body: JSON.stringify({ messageId: reportTargetId, reason })
  });
  closeReportModal();
  showToast(ok ? 'Laporan terkirim, terima kasih' : (data.error || 'Gagal mengirim laporan'), ok ? 'success' : 'error');
});

init();
