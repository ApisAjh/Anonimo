-- =====================================================================
-- ANONIMO — SQL Migration untuk Supabase PostgreSQL
-- Jalankan seluruh file ini di Supabase SQL Editor (satu kali, berurutan)
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. PROFILES — terhubung 1:1 dengan auth.users
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20 and username ~ '^[a-z0-9_]+$'),
  display_name text not null default '',
  bio text default '' check (char_length(bio) <= 200),
  avatar_url text,
  banner_url text,
  is_premium boolean not null default false,
  theme text not null default 'default',
  allow_images boolean not null default true,
  is_private boolean not null default false,
  message_count integer not null default 0,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles (username);

-- =====================================================================
-- 2. MESSAGES
-- =====================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text default 'Anonim' check (char_length(sender_name) <= 30),
  content text not null check (char_length(content) between 1 and 500),
  image_url text,
  is_read boolean not null default false,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  is_favorite boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_recipient on public.messages (recipient_id, created_at desc);
create index if not exists idx_messages_recipient_pinned on public.messages (recipient_id, is_pinned) where is_pinned = true;
create index if not exists idx_messages_recipient_favorite on public.messages (recipient_id, is_favorite) where is_favorite = true;
create index if not exists idx_messages_recipient_archived on public.messages (recipient_id, is_archived);

-- =====================================================================
-- 3. FAVORITES (opsional: mendukung banyak-ke-banyak jika diperlukan nanti)
-- =====================================================================
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, message_id)
);

create index if not exists idx_favorites_user on public.favorites (user_id);

-- =====================================================================
-- 4. VIEWS — tracking pengunjung profil
-- =====================================================================
create table if not exists public.views (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_views_profile on public.views (profile_id, created_at desc);
create unique index if not exists idx_views_unique_daily on public.views (profile_id, viewer_ip_hash, (created_at::date));

-- =====================================================================
-- 5. NOTIFICATIONS
-- =====================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('new_message','new_view','system')),
  content text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, is_read, created_at desc);

-- =====================================================================
-- 6. REPORTS
-- =====================================================================
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_ip_hash text not null,
  reason text not null check (reason in ('spam','harassment','sexual','violence','other')),
  details text default '',
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_message on public.reports (message_id);
create index if not exists idx_reports_status on public.reports (status);

-- =====================================================================
-- 7. SETTINGS — preferensi per pengguna
-- =====================================================================
create table if not exists public.settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_notifications boolean not null default true,
  push_notifications boolean not null default true,
  show_view_count boolean not null default true,
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- 8. PREMIUM — riwayat langganan
-- =====================================================================
create table if not exists public.premium (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null check (plan in ('monthly','3month','6month','yearly','lifetime')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_premium_user on public.premium (user_id, is_active);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- auto-update updated_at pada profiles
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- auto-buat row profiles + settings saat user baru register di Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', 'Pengguna Baru')
  );
  insert into public.settings (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- auto-increment message_count pada profiles saat pesan baru masuk
create or replace function public.increment_message_count()
returns trigger as $$
begin
  update public.profiles set message_count = message_count + 1 where id = new.recipient_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_messages_increment on public.messages;
create trigger trg_messages_increment
  after insert on public.messages
  for each row execute function public.increment_message_count();

-- auto-increment view_count pada profiles saat view baru tercatat
create or replace function public.increment_view_count()
returns trigger as $$
begin
  update public.profiles set view_count = view_count + 1 where id = new.profile_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_views_increment on public.views;
create trigger trg_views_increment
  after insert on public.views
  for each row execute function public.increment_view_count();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.favorites enable row level security;
alter table public.views enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.settings enable row level security;
alter table public.premium enable row level security;

-- profiles: siapa saja boleh baca (profil publik), hanya pemilik boleh update
create policy "profiles_select_public" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

-- messages: siapa saja boleh insert (kirim pesan anonim), hanya pemilik inbox boleh baca/update/hapus
create policy "messages_insert_anyone" on public.messages for insert with check (true);
create policy "messages_select_own" on public.messages for select using (auth.uid() = recipient_id);
create policy "messages_update_own" on public.messages for update using (auth.uid() = recipient_id);
create policy "messages_delete_own" on public.messages for delete using (auth.uid() = recipient_id);

-- favorites: hanya pemilik
create policy "favorites_all_own" on public.favorites for all using (auth.uid() = user_id);

-- views: insert bebas (tracking pengunjung), select hanya pemilik profil
create policy "views_insert_anyone" on public.views for insert with check (true);
create policy "views_select_own" on public.views for select using (auth.uid() = profile_id);

-- notifications: hanya pemilik
create policy "notifications_all_own" on public.notifications for all using (auth.uid() = user_id);

-- reports: siapa saja boleh insert, hanya lewat service role untuk baca (admin)
create policy "reports_insert_anyone" on public.reports for insert with check (true);

-- settings: hanya pemilik
create policy "settings_all_own" on public.settings for all using (auth.uid() = user_id);

-- premium: hanya pemilik boleh baca miliknya sendiri
create policy "premium_select_own" on public.premium for select using (auth.uid() = user_id);

-- =====================================================================
-- STORAGE BUCKETS (avatar & banner)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', true)
on conflict (id) do nothing;

create policy "avatar_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar_owner_write" on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatar_owner_update" on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatar_owner_delete" on storage.objects for delete using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "banner_public_read" on storage.objects for select using (bucket_id = 'banners');
create policy "banner_owner_write" on storage.objects for insert with check (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "banner_owner_update" on storage.objects for update using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "banner_owner_delete" on storage.objects for delete using (bucket_id = 'banners' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "msgimg_public_read" on storage.objects for select using (bucket_id = 'message-images');
create policy "msgimg_anyone_write" on storage.objects for insert with check (bucket_id = 'message-images');
