// ============================================================
// app.js — utilitas bersama: toast, API helper, persistent session
// ============================================================

const API_BASE = '/api';
const SESSION_KEY = 'anonimo_session';
/** Refresh access token 60 detik sebelum kedaluwarsa */
const REFRESH_MARGIN_MS = 60 * 1000;

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Simpan session Supabase ke localStorage (bertahan setelah browser ditutup).
 * Melengkapi expires_at jika belum ada agar bisa dicek di client.
 */
function setSession(session) {
  if (!session || !session.access_token) {
    clearSession();
    return;
  }

  const normalized = { ...session };

  // Supabase biasanya mengirim expires_at (unix detik) atau expires_in (detik)
  if (!normalized.expires_at) {
    const expiresIn = Number(normalized.expires_in) || 3600;
    normalized.expires_at = Math.floor(Date.now() / 1000) + expiresIn;
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** true jika access_token sudah / hampir kedaluwarsa */
function isAccessTokenExpired(session, marginMs = REFRESH_MARGIN_MS) {
  if (!session?.access_token) return true;
  if (!session.expires_at) return false;
  const expiresAtMs = Number(session.expires_at) * 1000;
  return Date.now() >= expiresAtMs - marginMs;
}

let _refreshInFlight = null;

/**
 * Refresh access_token memakai refresh_token.
 * Dedup: beberapa pemanggilan paralel memakai satu request yang sama.
 */
async function tryRefreshSession() {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    const session = getSession();
    if (!session?.refresh_token) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refresh_token })
      });
      const data = await res.json();
      if (data.success && data.session?.access_token) {
        setSession(data.session);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  })();

  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
}

/**
 * Pastikan ada session valid. Refresh proaktif jika token hampir habis.
 * @returns {Promise<object|null>} session atau null
 */
async function ensureSession() {
  let session = getSession();
  if (!session?.access_token || !session?.refresh_token) {
    return null;
  }

  if (isAccessTokenExpired(session)) {
    const ok = await tryRefreshSession();
    if (!ok) {
      session = getSession();
      if (!session?.access_token) return null;
      return session;
    }
    session = getSession();
  }

  return session;
}

/**
 * Guard halaman terproteksi (dashboard, settings, premium).
 * Refresh token dulu; jika benar-benar tidak ada sesi → redirect login.
 * @returns {Promise<object|null>}
 */
async function requireLoginOrRedirect() {
  const session = await ensureSession();
  if (!session) {
    clearSession();
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?next=${next}`;
    return null;
  }
  return session;
}

/**
 * Jika user sudah punya sesi valid, arahkan ke dashboard (atau ?next=).
 * Dipanggil di halaman login/register.
 */
async function redirectIfLoggedIn() {
  const session = await ensureSession();
  if (!session) return;

  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard.html';
  window.location.replace(safeNext);
}

async function apiFetch(path, options = {}) {
  let session = getSession();
  if (session?.refresh_token && isAccessTokenExpired(session)) {
    await tryRefreshSession();
    session = getSession();
  } else {
    session = getSession();
  }

  const headers = { ...(options.headers || {}) };

  // Hanya set JSON Content-Type jika ada body (GET lebih ringan)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { success: false, error: 'Respons server tidak valid' };
  }

  if (res.status === 401 && getSession()?.refresh_token) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiFetch(path, options);
    }
    clearSession();
  }

  return { ok: res.ok, status: res.status, data };
}

// Refresh diam-diam setiap 10 menit saat tab terbuka
if (typeof window !== 'undefined') {
  setInterval(async () => {
    const session = getSession();
    if (session?.refresh_token && isAccessTokenExpired(session, 5 * 60 * 1000)) {
      await tryRefreshSession();
    }
  }, 10 * 60 * 1000);
}

// ---------- Smooth-scroll & intersection observer untuk animasi masuk ----------
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('[data-animate]').forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
});
