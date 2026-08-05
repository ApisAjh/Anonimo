// ============================================================
// app.js — utilitas bersama: toast, API helper, session storage
// ============================================================

const API_BASE = '/api';

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
    const raw = localStorage.getItem('anonimo_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem('anonimo_session', JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem('anonimo_session');
}

async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
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

  if (res.status === 401 && session) {
    // coba refresh sesi sekali
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiFetch(path, options);
    }
    clearSession();
  }

  return { ok: res.ok, status: res.status, data };
}

async function tryRefreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refresh_token })
    });
    const data = await res.json();
    if (data.success) {
      setSession(data.session);
      return true;
    }
  } catch {
    // abaikan
  }
  return false;
}

function requireLoginOrRedirect() {
  const session = getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
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
