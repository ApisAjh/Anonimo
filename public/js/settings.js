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

  const avatarEl = document.getElementById('preview-avatar');
  if (currentProfile.avatar_url) {
    avatarEl.innerHTML = `<img src="${currentProfile.avatar_url}" alt="Avatar" />`;
  } else {
    avatarEl.textContent = (currentProfile.display_name || currentProfile.username).charAt(0).toUpperCase();
  }

  const bannerEl = document.getElementById('preview-banner');
  if (currentProfile.banner_url) {
    bannerEl.style.backgroundImage = `url(${currentProfile.banner_url})`;
  }

  renderThemeGrid();
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
  document.getElementById('preview-avatar').innerHTML = `<img src="${data.data.avatar_url}" alt="Avatar" />`;
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
  document.getElementById('preview-banner').style.backgroundImage = `url(${data.data.banner_url})`;
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

init();
