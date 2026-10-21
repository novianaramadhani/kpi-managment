# Sistem KPI

Aplikasi web untuk mengelola penilaian KPI karyawan berdasarkan departemen, job level, template KPI, parameter, dan periode penilaian.

## Fitur Utama

- Dashboard ringkasan penilaian KPI.
- Pengelolaan departemen, job level, dan karyawan.
- Pengaturan periode KPI.
- Template KPI berdasarkan departemen dan job level.
- Kategori, parameter, bobot, target, actual, dan band nilai.
- Input penilaian bulanan dan tahunan.
- Review dan finalisasi appraisal.
- Laporan dan export laporan.
- Audit trail untuk perubahan data.
- Health check koneksi database melalui `/api/health`.

## Teknologi

- Next.js 16
- React 19
- TypeScript
- PostgreSQL 16
- Drizzle ORM dan Drizzle Kit
- Tailwind CSS

## Struktur Direktori

```text
src/
  app/              Halaman Next.js dan API route
  components/       Komponen UI dan form
  db/               Koneksi database, schema, dan seed data
  lib/              Action server, perhitungan skor, dan laporan

docker-compose.yml  PostgreSQL untuk development
.drizzle/            File metadata Drizzle (dibuat saat migration)
```

## Persiapan

Pastikan sudah terpasang:

- Node.js
- npm
- Docker Desktop

Install dependency:

```bash
npm install
```

## Menjalankan Database dengan Docker

Jalankan PostgreSQL:

```bash
docker compose up -d
```

Konfigurasi database:

- Host: `127.0.0.1`
- Port host: `5433`
- User: `postgres`
- Password: `postgres`
- Database: `kpi_app`

Port host menggunakan `5433` karena port `5432` dapat dipakai oleh PostgreSQL lokal Windows.

Periksa status container:

```bash
docker compose ps
```

Menghentikan container tanpa menghapus data:

```bash
docker compose down
```

Volume database bernama `kpi_postgres_data`. Jangan menjalankan `docker compose down -v` kecuali memang ingin menghapus seluruh data database.

## Environment

File `.env.local` digunakan oleh Next.js:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kpi_app
```

`drizzle.config.json` juga menggunakan database `kpi_app` pada port `5433`.

## Membuat atau Memperbarui Tabel

Setelah database aktif, terapkan schema Drizzle:

```bash
npx drizzle-kit push
```

Jika ingin membuat file migration:

```bash
npx drizzle-kit generate --name init
```

Migration awal berada di direktori `drizzle/`.

## Menjalankan Aplikasi

Mode development:

```bash
npm run dev
```

Buka:

```text
http://localhost:3000
```

Pemeriksaan koneksi database:

```text
http://localhost:3000/api/health
```

Respons berhasil:

```json
{"ok":true}
```

## Data Demo

Data demo dapat diisi melalui action `seedDemo` pada aplikasi. Seed membuat contoh:

- System configuration.
- Departemen dan job level.
- Data karyawan.
- Template KPI.
- Kategori dan parameter KPI.
- Band nilai.
- Periode KPI tahun 2025.

Seed tidak mengisi ulang data jika tabel departemen sudah memiliki data.

## Halaman Aplikasi

- `/` - Dashboard
- `/setup` - Setup master data dan periode
- `/setup/templates` - Daftar template KPI
- `/penilaian` - Daftar appraisal
- `/review` - Review penilaian
- `/report` - Laporan
- `/audit` - Audit trail

## Perintah NPM

```bash
npm run dev       # Menjalankan development server
npm run build     # Membuat build production
npm run start     # Menjalankan build production
npm run lint      # Menjalankan ESLint
npm run typecheck # Memeriksa TypeScript
```

## Troubleshooting

### Error `DATABASE_URL is required`

Pastikan file `.env.local` ada di root project dan berisi `DATABASE_URL`.

### Error `password authentication failed`

Pastikan password pada `.env.local` sama dengan PostgreSQL Docker. Untuk konfigurasi default:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kpi_app
```

### Error koneksi pada port 5432

Periksa apakah PostgreSQL lokal Windows menggunakan port `5432`. Gunakan port Docker `5433` dan pastikan URL koneksi juga menggunakan `5433`.

### Error `drizzle-orm` belum terpasang

Jalankan:

```bash
npm install
```

### Database kosong

Pastikan container aktif, schema sudah diterapkan dengan `npx drizzle-kit push`, lalu jalankan fitur seed demo dari aplikasi.
