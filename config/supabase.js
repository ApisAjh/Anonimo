const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[config] Variabel Supabase belum lengkap di environment. Cek file .env / Vercel Env');
}

/**
 * Opsi auth untuk pemakaian server-side (Express / Vercel serverless).
 * - Jangan persist session di memori proses (stateless)
 * - Matikan deteksi URL (khusus browser)
 * - flowType implicit: signInWithPassword memakai grant password langsung,
 *   tidak bergantung code-verifier PKCE
 */
const serverAuthOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'implicit'
  }
};

// Client publik (anon key) — signUp, signInWithPassword, refreshSession, resetPassword
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, serverAuthOptions);

// Client admin (service role) — bypass RLS, getUser(token), admin update/delete
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, serverAuthOptions);

module.exports = { supabasePublic, supabaseAdmin, SUPABASE_URL };
