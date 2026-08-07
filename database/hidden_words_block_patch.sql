-- =====================================================================
-- ANONIMO — Patch: Hidden Words + Block Anonymous Sender
-- Jalankan di Supabase SQL Editor (setelah migrations.sql utama)
-- =====================================================================

-- 1. HIDDEN WORDS — kata yang disaring dari pesan masuk
create table if not exists public.hidden_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  constraint hidden_words_word_len check (char_length(word) between 1 and 40),
  constraint hidden_words_unique unique (user_id, word)
);

create index if not exists idx_hidden_words_user on public.hidden_words (user_id);

-- 2. BLOCKED SENDERS — blokir pengirim anonim via ip_hash
create table if not exists public.blocked_senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sender_hash text not null,
  label text default 'Anonim',
  created_at timestamptz not null default now(),
  constraint blocked_senders_hash_len check (char_length(sender_hash) >= 16),
  constraint blocked_senders_unique unique (user_id, sender_hash)
);

create index if not exists idx_blocked_senders_user on public.blocked_senders (user_id);
create index if not exists idx_blocked_senders_lookup
  on public.blocked_senders (user_id, sender_hash);

-- RLS
alter table public.hidden_words enable row level security;
alter table public.blocked_senders enable row level security;

drop policy if exists "hidden_words_select_own" on public.hidden_words;
drop policy if exists "hidden_words_insert_own" on public.hidden_words;
drop policy if exists "hidden_words_delete_own" on public.hidden_words;
drop policy if exists "blocked_senders_select_own" on public.blocked_senders;
drop policy if exists "blocked_senders_insert_own" on public.blocked_senders;
drop policy if exists "blocked_senders_delete_own" on public.blocked_senders;

create policy "hidden_words_select_own" on public.hidden_words
  for select using (auth.uid() = user_id);
create policy "hidden_words_insert_own" on public.hidden_words
  for insert with check (auth.uid() = user_id);
create policy "hidden_words_delete_own" on public.hidden_words
  for delete using (auth.uid() = user_id);

create policy "blocked_senders_select_own" on public.blocked_senders
  for select using (auth.uid() = user_id);
create policy "blocked_senders_insert_own" on public.blocked_senders
  for insert with check (auth.uid() = user_id);
create policy "blocked_senders_delete_own" on public.blocked_senders
  for delete using (auth.uid() = user_id);
