# Panduan Deployment & Operasional KPI Noviana

Dokumen ini menggabungkan panduan arsitektur Docker, konfigurasi environment, dan prosedur deployment untuk server Ubuntu maupun lingkungan pengembangan Windows.

## 1. Arsitektur Docker Compose

Project ini dipisahkan menjadi dua berkas Docker Compose agar pembaruan kode aplikasi tidak me-restart database:

| Berkas | Container | Port Host : Container | Fungsi |
| :--- | :--- | :--- | :--- |
| `docker-compose.db.yml` | `kpi-postgres`, `kpi-backup` | `127.0.0.1:5433:5432` | PostgreSQL 16 dan backup otomatis harian (`.sql.gz` ke `./backups`). |
| `docker-compose.app.yml` | `kpi-app` | `127.0.0.1:3001:3000` | Aplikasi Next.js 16 Standalone. Di-rebuild setiap kali ada pembaruan kode. |

Kedua stack terhubung melalui jaringan eksternal `kpi-network` dan menyimpan data PostgreSQL pada volume eksternal `template_kpi_postgres_data` (dapat disesuaikan melalui `DB_VOLUME_NAME`).

## 2. Konfigurasi Environment (`.env`)

1. Berkas `.env` adalah konfigurasi utama yang dibaca oleh Docker Compose dan container `kpi-app`. Berkas ini diabaikan oleh Git (`.gitignore`).
2. Gunakan `.env.example` sebagai acuan variabel ketika menyiapkan server baru:
   ```bash
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```
3. Perbedaan nilai penting antara Docker (Server/Container) dan Native (`npm run dev`):
   - **Di dalam Docker (`.env`)**: `DATABASE_URL` wajib mengarah ke host container `kpi-postgres:5432`:
     ```env
     DATABASE_URL=postgresql://postgres:<password>@kpi-postgres:5432/kpi_app
     POSTGRES_HOST=kpi-postgres
     POSTGRES_PORT=5432
     ```
   - **Pengembangan Native di Laptop (`.env.local`)**: `DATABASE_URL` mengarah ke port loopback host `127.0.0.1:5433`.

## 3. Persiapan Awal di Server Ubuntu (`/var/kpi-managment`)

Jalankan langkah berikut hanya sekali saat menyiapkan server atau memastikan prasyarat terpenuhi:

```bash
cd /var/kpi-managment

# 1. Pastikan jaringan Docker tersedia
docker network inspect kpi-network >/dev/null 2>&1 || docker network create kpi-network

# 2. Pastikan direktori upload dan backup memiliki izin untuk user container (uid 1001)
mkdir -p public/uploads backups
sudo chown -R 1001:1001 public/uploads

# 3. Nyalakan database dan layanan backup jika belum berjalan
docker compose -f docker-compose.db.yml up -d
```

## 4. Prosedur Update Aplikasi di Server Ubuntu

Setiap kali ada perubahan kode yang sudah di-push ke branch `main`, jalankan:

```bash
cd /var/kpi-managment
bash scripts/deploy.sh
```

Alur yang dijalankan `scripts/deploy.sh`:
1. Memastikan jaringan `kpi-network` aktif dan memvalidasi sintaks `.env` serta `docker-compose.app.yml`.
2. Menarik kode terbaru dengan `git pull --ff-only`.
3. Menyimpan cadangan image aktif ke `kpi-app:previous`.
4. Membangun ulang image `kpi-app:latest` dan me-restart container `kpi-app`.
5. Memantau status healthcheck container hingga 120 detik. Jika gagal, script menampilkan log terakhir dan mengembalikan container ke image `kpi-app:previous`.

Jika pembaruan membutuhkan migrasi skema SQL dari folder `drizzle/`, jalankan:

```bash
docker exec kpi-app node ./scripts/run-production-migration.js
```

## 5. Konfigurasi Cloudflare Tunnel (`kpi.noviana.app`)

Container `kpi-app` berjalan pada port host `127.0.0.1:3001`. Pastikan `/etc/cloudflared/config.yml` di server Ubuntu mengarah ke port `3001` (lihat `cloudflared/config.ubuntu.example.yml`):

```yaml
tunnel: dc6960bf-c1c8-451c-9684-4a68b7f3ab71
credentials-file: /etc/cloudflared/credentials.json
protocol: http2

ingress:
  - hostname: kpi.noviana.app
    service: http://127.0.0.1:3001
  - service: http_status:404
```

Jika mengubah konfigurasi tunnel di Ubuntu, terapkan dengan:

```bash
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

## 6. Operasional di Windows (Laptop)

- **Menyalakan seluruh sistem**: jalankan `start-kpi.bat`.
- **Memeriksa status container & tunnel**: jalankan `status-kpi.bat`.
- **Menghentikan seluruh layanan**: jalankan `stop-kpi.bat`.
