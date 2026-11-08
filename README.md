# Sistem KPI Noviana

Aplikasi web pengelolaan dan penilaian Key Performance Indicator (KPI) karyawan terintegrasi dengan autentikasi Odoo ERP.

## Fitur Utama

- Dashboard ringkasan penilaian KPI.
- Sinkronisasi dan pengelolaan departemen, job level, site/pit, serta karyawan.
- Pengaturan periode KPI, penugasan asesor, dan delegasi penilaian.
- Pembuatan dan import template KPI dari Excel (kategori, parameter, sub-indikator, bobot, dan kriteria skor).
- Input penilaian bulanan dan tahunan beserta lampiran bukti (evidence).
- Laporan rekapitulasi dan export Excel terformat.
- Audit trail perubahan data dan healthcheck melalui `/api/health`.

## Teknologi

- Next.js 16 (App Router, Standalone Build)
- React 19 & TypeScript
- PostgreSQL 16 & Drizzle ORM
- Tailwind CSS 4

## Struktur Direktori Utama

```text
├── src/
│   ├── app/                      Halaman Next.js (App Router) dan API route
│   ├── components/               Komponen UI, modal, dan form
│   ├── db/                       Koneksi database, schema Drizzle, dan seed
│   └── lib/                      Server actions, kalkulasi skor, dan integrasi Odoo
├── drizzle/                      Berkas migrasi SQL
├── scripts/                      Skrip deployment, migrasi produksi, dan validasi
├── cloudflared/                  Contoh konfigurasi Cloudflare Tunnel
├── public/uploads/               Direktori penyimpanan lampiran bukti KPI
├── backups/                      Direktori hasil backup otomatis PostgreSQL (.sql.gz)
├── docker-compose.db.yml         Stack Docker PostgreSQL 16 dan auto-backup
├── docker-compose.app.yml        Stack Docker aplikasi Next.js Standalone
├── Dockerfile                    Konfigurasi multi-stage build aplikasi
├── .env.example                  Template variabel environment
└── DEPLOYMENT.md                 Panduan lengkap deployment Ubuntu dan operasional Docker
```

## Menjalankan Secara Lokal

### 1. Menggunakan Docker Penuh (Rekomendasi)

Salin `.env.example` menjadi `.env`, sesuaikan kredensialnya, lalu jalankan `start-kpi.bat` (Windows) atau perintah berikut:

```bash
docker network create kpi-network
docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.app.yml up -d --build
```

Aplikasi dapat diakses pada `http://127.0.0.1:3001` dan database PostgreSQL pada `127.0.0.1:5433`.

### 2. Mode Pengembangan Native (`next dev`)

Nyalakan database Docker, siapkan `.env.local` dengan `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kpi_app`, lalu jalankan:

```bash
docker compose -f docker-compose.db.yml up -d
npm install
npm run dev
```

Aplikasi berjalan pada `http://localhost:3000`.

## Perintah NPM

```bash
npm run dev        # Menjalankan development server (port 3000)
npm run build      # Membangun aplikasi production (.next_fresh/standalone)
npm run start      # Menjalankan server Next.js
npm run lint       # Memeriksa kualitas kode dengan ESLint
npm run typecheck  # Memeriksa tipe TypeScript
```

Untuk panduan deployment ke server Ubuntu dan pengelolaan Cloudflare Tunnel, lihat [DEPLOYMENT.md](./DEPLOYMENT.md).
