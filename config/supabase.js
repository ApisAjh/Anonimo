const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[config] Variabel Supabase belum lengkap di environment. Cek file .env');
}

// Client publik — dipakai untuk operasi yang menghormati RLS (mis. verifikasi token milik user)
const supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Client admin — bypass RLS, HANYA dipakai di server untuk operasi terkontrol
// (mis. insert pesan anonim, hitung view, verifikasi session)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

module.exports = { supabasePublic, supabaseAdmin };
