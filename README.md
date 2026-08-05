# Anonimo

Platform pesan anonim modern — kirim dan terima pesan tanpa perlu identitas, dengan desain glassmorphism dan performa tinggi.

> **Status:** Fondasi inti (auth, kirim pesan, profil publik, landing page) sudah lengkap dan berfungsi. Dashboard inbox, halaman pengaturan, dan fitur premium menyusul di iterasi berikutnya — lihat bagian [Roadmap](#roadmap).

## Deskripsi

Anonimo memungkinkan siapa saja mengirim pesan anonim ke pengguna lain melalui link profil publik (`/u/username`), tanpa perlu login. Pemilik akun bisa membaca pesan yang masuk, mem-pin, memfavoritkan, mengarsipkan, atau menghapusnya lewat dashboard.

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6) — tanpa framework
- **Backend:** Node.js 22+, Express.js (dijalankan sebagai Vercel Serverless Function)
- **Database:** Supabase PostgreSQL
- **Auth:** Supabase Auth (tanpa JWT/sistem login buatan sendiri)
- **Storage:** Supabase Storage (avatar, banner, gambar pesan)
- **Deploy:** Vercel

## Struktur Folder

```
├── api/
│   └── index.js          # Entry point Express (serverless function)
├── config/
│   └── supabase.js        # Client Supabase (public & admin)
├── middleware/
│   ├── auth.js             # Verifikasi session Supabase
│   ├── rateLimiter.js       # Rate limit umum, kirim pesan, auth
│   └── errorHandler.js      # Global error & 404 handler
├── routes/
│   ├── auth.routes.js       # Register, login, logout, reset password, dll
│   ├── messages.routes.js   # Kirim pesan, inbox, pin/favorit/arsip/hapus
│   └── profile.routes.js    # Profil publik, update profil, upload avatar/banner
├── utils/
│   ├── validators.js        # Validasi & sanitasi input
│   └── hash.js               # Hash IP (anti-spam, tracking view)
├── database/
│   └── migrations.sql        # Migration lengkap: tabel, index, trigger, RLS
├── public/
│   ├── index.html             # Landing page
│   ├── login.html / register.html
│   ├── profile.html            # Profil publik + form kirim pesan
│   ├── css/style.css
│   └── js/app.js
├── package.json
├── vercel.json
└── .env.example
```

## Instalasi

```bash
npm install
```

## Konfigurasi Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan seluruh isi file [`database/migrations.sql`](./database/migrations.sql) satu kali. File ini akan membuat:
   - 8 tabel: `profiles`, `messages`, `favorites`, `views`, `notifications`, `reports`, `settings`, `premium`
   - Trigger otomatis (buat profil saat register, hitung pesan/view)
   - Row Level Security (RLS) di seluruh tabel
   - 3 storage bucket publik: `avatars`, `banners`, `message-images`
3. Di **Authentication → Settings**, aktifkan **Email confirmation** jika ingin verifikasi email wajib.
4. Salin `Project URL`, `anon public key`, dan `service_role key` dari **Project Settings → API**.

## Environment Variable

Salin `.env.example` menjadi `.env` lalu isi:

```
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NODE_ENV=development
APP_URL=http://localhost:3000
PORT=3000
```

⚠️ **Jangan pernah** meng-commit `SUPABASE_SERVICE_ROLE_KEY` ke repository publik.

## Menjalankan Project

```bash
npm run dev
```

Buka `http://localhost:3000`.

## Deploy ke Vercel

1. Push project ke GitHub/GitLab/Bitbucket.
2. Import repository di [vercel.com/new](https://vercel.com/new).
3. Tambahkan environment variable yang sama seperti di `.env` pada **Project Settings → Environment Variables**.
4. Deploy. `vercel.json` sudah dikonfigurasi agar Express berjalan sebagai serverless function dan seluruh route (`/u/:username`, `/login`, dll) terarah dengan benar.

## Daftar Fitur (Status Saat Ini)

**Selesai:**
- Landing page responsif (hero, fitur, cara kerja, FAQ, CTA, footer)
- Register, login, logout, refresh session, forgot/reset password, hapus akun (Supabase Auth penuh)
- Kirim pesan anonim tanpa login (nama opsional, emoji, upload gambar, rate limit anti-spam)
- Profil publik di `/u/username` dengan tracking view harian
- Update profil, upload avatar & banner ke Supabase Storage
- API inbox: list pesan dengan pagination, search, filter (pin/favorit/arsip), update status, hapus
- Keamanan: Helmet, CORS, rate limiting, sanitasi HTML, prepared query via Supabase client, RLS di setiap tabel

**Selesai (iterasi lanjutan):**
- Sistem Premium penuh (upgrade/renew/cancel, auto-expire, middleware, halaman `/premium`)
- Captcha matematika server-side pada form kirim pesan (HMAC, sekali pakai, expire 5 menit)

**Roadmap berikutnya:**
- Integrasi payment gateway (Midtrans / Xendit) untuk Premium
- Notifikasi push browser
- Admin panel moderasi laporan

## Kontribusi

Pull request dipersilakan. Untuk perubahan besar, buka issue terlebih dahulu untuk didiskusikan.

## Lisensi

MIT License — Copyright © 2026 ApisAjh.
