-- =====================================================================
-- Patch: perluas constraint plan Premium (jalankan jika migrations
-- sudah pernah dijalankan sebelumnya tanpa plan 3month/6month)
-- =====================================================================

alter table public.premium drop constraint if exists premium_plan_check;
alter table public.premium
  add constraint premium_plan_check
  check (plan in ('monthly', '3month', '6month', 'yearly', 'lifetime'));
