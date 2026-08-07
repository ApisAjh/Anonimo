// ============================================================
// settings.js — logika halaman pengaturan
// ============================================================

let session = null;

const THEMES = [
  { id: 'default', label: 'Default', premium: false },
  { id: 'sunset', label: 'Sunset', premium: false },
  { id: 'ocean', label: 'Ocean', premium: false },
  { id: 'midnight', label: 'Midnight', premium: true },
  { id: 'aurora', label: 'Aurora', premium: true },
  { id: 'gold', label: 'Gold', premium: true }
];

let currentProfile = null;

async function init() {
  session = await requireLoginOrRedirect();
  if (!session) return;
  await loadProfile();
  await loadSettings();
  await Promise.all([loadHiddenWords(), loadBlockedUsers()]);
}

async function loadProfile() {
  const { ok, data } = await apiFetch('/auth/me');
  if (!ok) {
    showToast('Gagal memuat profil', 'error');
    return;
  }
  currentProfile = data.profile;

  document.getElementById('username-display').value = `@${currentProfile.username}`;
  document.getElementById('display-name').value = currentProfile.display_name || '';
  document.getElementById('bio').value = currentProfile.bio || '';
  document.getElementById('toggle-private').checked = !!currentProfile.is_private;
  document.getElementById('toggle-allow-images').checked = currentProfile.allow_images !== false;

  applyMediaPreviews();
  renderThemeGrid();
}

/** Terapkan kelas tema ke preview avatar & banner */
function applyPreviewTheme(themeId) {
  const theme = themeId || currentProfile?.theme || 'default';
  const avatarEl = document.getElementById('preview-avatar');
  const bannerEl = document.getElementById('preview-banner');
  if (!avatarEl || !bannerEl) return;

  const themeClasses = THEMES.map((t) => `theme-${t.id}`);
  avatarEl.classList.remove(...themeClasses);
  bannerEl.classList.remove(...themeClasses);
  avatarEl.classList.add(`theme-${theme}`);
  bannerEl.classList.add(`theme-${theme}`);
}

/** Render avatar + banner + tema aktif */
function applyMediaPreviews() {
  const avatarEl = document.getElementById('preview-avatar');
  const bannerEl = document.getElementById('preview-banner');
  if (!avatarEl || !bannerEl || !currentProfile) return;

  applyPreviewTheme(currentProfile.theme);

  // Avatar
  if (currentProfile.avatar_url) {
    avatarEl.innerHTML = `<img src="${currentProfile.avatar_url}" alt="Avatar" onerror="this.remove()" />`;
  } else {
    avatarEl.innerHTML = '';
    avatarEl.textContent = (currentProfile.display_name || currentProfile.username || '?').charAt(0).toUpperCase();
  }

  // Banner: foto sebagai <img> agar tidak gepeng (object-fit: cover)
  bannerEl.style.backgroundImage = '';
  const oldPhoto = bannerEl.querySelector('.banner-photo');
  if (oldPhoto) oldPhoto.remove();
  bannerEl.classList.remove('has-photo');

  if (currentProfile.banner_url) {
    const img = document.createElement('img');
    img.className = 'banner-photo';
    img.alt = 'Banner';
    img.src = currentProfile.banner_url;
    img.onload = () => {
      bannerEl.classList.add('has-photo');
    };
    img.onerror = () => {
      img.remove();
      bannerEl.classList.remove('has-photo');
    };
    bannerEl.appendChild(img);
  }
}

async function loadSettings() {
  const { ok, data } = await apiFetch('/settings');
  if (!ok) return;
  document.getElementById('toggle-email-notif').checked = data.data.email_notifications !== false;
  document.getElementById('toggle-push-notif').checked = data.data.push_notifications !== false;
  document.getElementById('toggle-show-views').checked = data.data.show_view_count !== false;
}

function renderThemeGrid() {
  const grid = document.getElementById('theme-grid');
  grid.innerHTML = '';

  THEMES.forEach((theme) => {
    const locked = theme.premium && !currentProfile.is_premium;
    const selected = currentProfile.theme === theme.id;

    const el = document.createElement('div');
    el.className = `theme-option theme-${theme.id} ${selected ? 'selected' : ''} ${locked ? 'locked' : ''} ${theme.premium ? 'premium-theme' : ''}`;
    el.textContent = theme.label;
    if (theme.premium) el.innerHTML += '<span class="theme-premium-badge">✨ Premium</span>';
    if (locked) el.innerHTML += '<span class="theme-lock-icon">🔒</span>';

    el.addEventListener('click', async () => {
      if (locked) {
        showToast('Tema ini khusus pengguna Premium', 'info');
        return;
      }
      const { ok, data } = await apiFetch('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ theme: theme.id })
      });
      if (!ok) {
        showToast(data.error || 'Gagal mengganti tema', 'error');
        return;
      }
      currentProfile.theme = theme.id;
      applyPreviewTheme(theme.id);
      renderThemeGrid();
      showToast('Tema diperbarui', 'success');
    });

    grid.appendChild(el);
  });
}

// ---------- Edit profil ----------
document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('profile-error');
  errorEl.textContent = '';

  const displayName = document.getElementById('display-name').value.trim();
  const bio = document.getElementById('bio').value.trim();

  const { ok, data } = await apiFetch('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: displayName, bio })
  });

  if (!ok) {
    errorEl.textContent = data.error || 'Gagal menyimpan profil';
    return;
  }
  currentProfile = { ...currentProfile, ...data.data };
  showToast('Profil berhasil disimpan', 'success');
});

// ---------- Avatar & banner upload ----------
document.getElementById('avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  const res = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${(getSession() || session).access_token}` },
    body: formData
  });
  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Gagal mengunggah avatar', 'error');
    return;
  }
  currentProfile.avatar_url = data.data.avatar_url;
  applyMediaPreviews();
  showToast('Avatar diperbarui', 'success');
});

document.getElementById('banner-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('banner', file);

  const res = await fetch('/api/profile/banner', {
    method: 'POST',
    headers: { Authorization: `Bearer ${(getSession() || session).access_token}` },
    body: formData
  });
  const data = await res.json();

  if (!res.ok) {
    showToast(data.error || 'Gagal mengunggah banner', 'error');
    return;
  }
  currentProfile.banner_url = data.data.banner_url;
  applyMediaPreviews();
  showToast('Banner diperbarui', 'success');
});

// ---------- Privasi ----------
document.getElementById('toggle-private').addEventListener('change', async (e) => {
  const { ok, data } = await apiFetch('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ is_private: e.target.checked })
  });
  if (!ok) {
    showToast(data.error || 'Gagal memperbarui privasi', 'error');
    e.target.checked = !e.target.checked;
  }
});

document.getElementById('toggle-allow-images').addEventListener('change', async (e) => {
  const { ok, data } = await apiFetch('/profile', {
    method: 'PATCH',
    body: JSON.stringify({ allow_images: e.target.checked })
  });
  if (!ok) {
    showToast(data.error || 'Gagal memperbarui pengaturan', 'error');
    e.target.checked = !e.target.checked;
  }
});

// ---------- Notifikasi ----------
function bindNotifToggle(elId, field) {
  document.getElementById(elId).addEventListener('change', async (e) => {
    const { ok, data } = await apiFetch('/settings', {
      method: 'PATCH',
      body: JSON.stringify({ [field]: e.target.checked })
    });
    if (!ok) {
      showToast(data.error || 'Gagal memperbarui notifikasi', 'error');
      e.target.checked = !e.target.checked;
    }
  });
}
bindNotifToggle('toggle-email-notif', 'email_notifications');
bindNotifToggle('toggle-push-notif', 'push_notifications');
bindNotifToggle('toggle-show-views', 'show_view_count');

// ---------- Ganti password ----------
document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('password-error');
  errorEl.textContent = '';

  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword.length < 8) {
    errorEl.textContent = 'Password minimal 8 karakter';
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'Konfirmasi password tidak cocok';
    return;
  }

  const { ok, data } = await apiFetch('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ newPassword })
  });

  if (!ok) {
    errorEl.textContent = data.error || 'Gagal mengganti password';
    return;
  }

  document.getElementById('password-form').reset();
  showToast('Password berhasil diganti', 'success');
});

// ---------- Logout semua device ----------
document.getElementById('logout-all-btn').addEventListener('click', async () => {
  if (!confirm('Keluar dari semua perangkat? Kamu perlu login ulang di sini juga.')) return;
  await apiFetch('/auth/logout-all', { method: 'POST' });
  clearSession();
  window.location.href = '/login.html';
});

// ---------- Hapus akun ----------
document.getElementById('delete-account-btn').addEventListener('click', () => {
  document.getElementById('delete-modal-overlay').classList.add('open');
});
document.getElementById('delete-cancel').addEventListener('click', () => {
  document.getElementById('delete-modal-overlay').classList.remove('open');
  document.getElementById('delete-confirm-input').value = '';
});
document.getElementById('delete-confirm').addEventListener('click', async () => {
  const confirmText = document.getElementById('delete-confirm-input').value.trim();
  if (confirmText !== 'HAPUS') {
    showToast('Ketik HAPUS untuk mengonfirmasi', 'error');
    return;
  }
  const { ok, data } = await apiFetch('/auth/account', { method: 'DELETE' });
  if (!ok) {
    showToast(data.error || 'Gagal menghapus akun', 'error');
    return;
  }
  clearSession();
  showToast('Akun berhasil dihapus', 'success');
  setTimeout(() => { window.location.href = '/'; }, 1200);
});



// ---------- Hidden Words ----------
async function loadHiddenWords() {
  const listEl = document.getElementById('hidden-words-list');
  const metaEl = document.getElementById('hidden-words-meta');
  if (!listEl) return;

  const { ok, data } = await apiFetch('/moderation/hidden-words');
  if (!ok) {
    listEl.innerHTML = '<span class="settings-meta">Gagal memuat daftar kata</span>';
    return;
  }

  const words = data.data || [];
  const max = data.meta?.max || 100;
  if (metaEl) metaEl.textContent = `${words.length} / ${max} kata`;

  listEl.innerHTML = '';
  words.forEach((row) => {
    const tag = document.createElement('span');
    tag.className = 'word-tag';
    tag.innerHTML = `<span>${escapeHtmlSettings(row.word)}</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Hapus kata');
    btn.textContent = '×';
    btn.addEventListener('click', () => removeHiddenWord(row.id));
    tag.appendChild(btn);
    listEl.appendChild(tag);
  });
}

function escapeHtmlSettings(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function removeHiddenWord(id) {
  const { ok, data } = await apiFetch(`/moderation/hidden-words/${id}`, { method: 'DELETE' });
  if (!ok) {
    showToast(data.error || 'Gagal menghapus kata', 'error');
    return;
  }
  showToast('Kata dihapus', 'success');
  await loadHiddenWords();
}

document.getElementById('hidden-word-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('hidden-word-input');
  const errorEl = document.getElementById('hidden-word-error');
  if (errorEl) errorEl.textContent = '';
  const word = (input.value || '').trim();
  if (!word) {
    if (errorEl) errorEl.textContent = 'Kata wajib diisi';
    return;
  }

  const { ok, data } = await apiFetch('/moderation/hidden-words', {
    method: 'POST',
    body: JSON.stringify({ word })
  });

  if (!ok) {
    if (errorEl) errorEl.textContent = data.error || 'Gagal menambahkan kata';
    return;
  }

  input.value = '';
  showToast('Kata ditambahkan', 'success');
  await loadHiddenWords();
});

// ---------- Blocked Users ----------
async function loadBlockedUsers() {
  const listEl = document.getElementById('blocked-list');
  const emptyEl = document.getElementById('blocked-empty');
  if (!listEl) return;

  const { ok, data } = await apiFetch('/moderation/blocked');
  if (!ok) {
    listEl.innerHTML = '<span class="settings-meta">Gagal memuat daftar blokir</span>';
    return;
  }

  const rows = data.data || [];
  listEl.innerHTML = '';
  if (rows.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'blocked-item';
    const when = row.created_at ? new Date(row.created_at).toLocaleDateString('id-ID') : '';
    item.innerHTML = `
      <div class="blocked-item-info">
        <div class="blocked-item-label">${escapeHtmlSettings(row.label || 'Anonim')}</div>
        <div class="blocked-item-meta">ID ${escapeHtmlSettings(row.fingerprint || '—')} · ${when}</div>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost btn-sm';
    btn.textContent = '✅ Unblock';
    btn.addEventListener('click', () => unblockSender(row.id));
    item.appendChild(btn);
    listEl.appendChild(item);
  });
}

async function unblockSender(id) {
  if (!confirm('Buka blokir pengirim ini?')) return;
  const { ok, data } = await apiFetch(`/moderation/blocked/${id}`, { method: 'DELETE' });
  if (!ok) {
    showToast(data.error || 'Gagal membuka blokir', 'error');
    return;
  }
  showToast('Blokir dicabut', 'success');
  await loadBlockedUsers();
}

init();
