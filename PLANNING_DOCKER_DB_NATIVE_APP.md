# Dokumen Rencana Arsitektur Hybrid: Database di Docker & Aplikasi Native

Dokumen ini memuat rencana kerja, analisis arsitektur, dan langkah-langkah teknis untuk memisahkan aplikasi web Next.js dari container Docker agar berjalan secara **native** di host (Windows/Server), sementara **database PostgreSQL** dan **layanan backup otomatis** tetap berjalan di dalam Docker container.

---

## 1. Latar Belakang & Tujuan

### 1.1 Kondisi Saat Ini (All-in-Docker)
Saat ini seluruh stack berjalan di dalam Docker Compose:
- **`kpi-app`**: Aplikasi Next.js (port 3000 container -> port 3000 host loopback)
- **`kpi-postgres`**: Database PostgreSQL 16 (port 5432 container -> port 5433 host)
- **`kpi-backup`**: Layanan auto-backup berkala ke folder `./backups`
- **`kpi-tunnel`**: Cloudflare Tunnel (`kpi.noviana.app` -> `http://app:3000`)

### 1.2 Tujuan Migrasi
1. **Performa & Kemudahan Development**: Menghilangkan overhead build Docker image di Windows saat melakukan update kode dan debugging.
2. **Kecepatan Hot Reload (HMR)**: Menjalankan Next.js Turbopack langsung di host tanpa latency filesystem bind-mount Docker.
3. **Data Safety & Isolasi**: Database PostgreSQL tetap terisolasi di Docker dengan persistent volume aman (`template_kpi_postgres_data`) dan auto-backup harian tetap aktif.
4. **Efisiensi Sumber Daya**: Mengurangi penggunaan memori dan CPU Docker VM di Windows.

---

## 2. Perbandingan Arsitektur

```mermaid
graph TD
    subgraph Arsitektur Saat Ini (All-in-Docker)
        subgraph Docker Engine
            AppContainer[Next.js App :3000]
            DBContainer[PostgreSQL 16 :5432]
            BackupContainer[Auto Backup Cron]
            TunnelContainer[Cloudflare Tunnel]
            AppContainer -->|Docker Network| DBContainer
            BackupContainer -->|Docker Network| DBContainer
            TunnelContainer -->|Docker Network| AppContainer
        end
    end

    subgraph Arsitektur Target (Hybrid)
        subgraph Host Native Windows/Server
            NativeApp[Next.js App :3000 (PM2 / npm start)]
            NativeTunnel[Cloudflare Tunnel (Native / Docker host.docker.internal)]
        end
        subgraph Docker Engine (DB Only + Backup)
            DBDocker[PostgreSQL 16 (Port 5433:5432)]
            BackupDocker[Auto Backup Cron]
            BackupDocker -->|Docker Network| DBDocker
        end
        NativeApp -->|127.0.0.1:5433| DBDocker
        NativeTunnel -->|127.0.0.1:3000| NativeApp
    end
```

---

## 3. Analisis Komponen & Dampak Perubahan

| Komponen | Status Baru | Konfigurasi / Port | Keterangan |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | **Docker** | `127.0.0.1:5433:5432` | Volume data `template_kpi_postgres_data` dipertahankan, tidak ada data hilang. |
| **Database Backup** | **Docker** | Internal network | Tetap berjalan otomatis via image `prodrigestivill/postgres-backup-local`. |
| **Aplikasi Next.js** | **Native Host** | `http://localhost:3000` | Dijalankan via Node.js v22 lokal dengan PM2 atau npm. |
| **Cloudflare Tunnel** | **Hybrid / Native** | Rute ke `localhost:3000` | Menghubungkan domain publik ke aplikasi native host. |
| **File Environment** | Terpisah | `.env` (Docker) & `.env.local` (Native) | `.env.local` memuat koneksi ke `127.0.0.1:5433`. |

---

## 4. Rencana Eksekusi Langkah-demi-Langkah

### Tahap 1: Backup Database Penuh (Safety First)
Sebelum mengubah konfigurasi apapun, jalankan backup manual database:
```powershell
# Jalankan backup on-demand dari container backup
docker compose exec backup /backup.sh

# Verifikasi file backup tersimpan di folder backups/
Get-ChildItem -Path .\backups\
```

---

### Tahap 2: Penyesuaian Docker Compose (Khusus Database & Backup)
Buat file `docker-compose.db.yml` baru atau modifikasi `docker-compose.yml` agar hanya menjalankan service `db` dan `backup`:

```yaml
# docker-compose.yml (DB-Only Stack)
services:
  db:
    image: postgres:16
    container_name: kpi-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-kpi_app}
      TZ: Asia/Jakarta
    volumes:
      - kpi_postgres_data:/var/lib/postgresql/data
    ports:
      # Port 5433 diexpose ke loopback host untuk aplikasi native
      - "127.0.0.1:5433:5432"
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-kpi_app}" ]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2048M
        reservations:
          cpus: '0.5'
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"

  backup:
    image: prodrigestivill/postgres-backup-local:16-alpine
    container_name: kpi-backup
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./backups:/backups
    environment:
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      POSTGRES_DB: ${POSTGRES_DB:-kpi_app}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      SCHEDULE: ${BACKUP_SCHEDULE:-@daily}
      BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-14}
      BACKUP_SUFFIX: ".sql.gz"
      POSTGRES_EXTRA_OPTS: "-Z6 --schema=public --blobs"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  kpi_postgres_data:
    name: template_kpi_postgres_data

networks:
  default:
    name: template_default
```

---

### Tahap 3: Konfigurasi Environment Aplikasi Native (`.env.local`)
Pastikan file `.env.local` pada root project mengarah ke database container di port `5433`:

```env
# Koneksi Database PostgreSQL (Docker Host Loopback)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/kpi_app
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=kpi_app

# Autentikasi & Odoo ERP Integration
AUTH_MODE=odoo
ODOO_BASE_URL=https://erp1.gpedata.id
ODOO_API_VERSION=v1
ODOO_ADMIN_USER=admin
ODOO_ADMIN_PASSWORD=admin
ODOO_SERVICE_NIK=1.1025.273
ODOO_SERVICE_PASSWORD=123456
DEV_SUPERADMIN_NIK=1.1025.273

# Keamanan Token & TLS
JWT_SECRET=RBINGX1JYv6cCkcjE5vz4M0d7NRFGFYUfFSebNY/yhA=
JWT_EXPIRES_IN=8h
NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

### Tahap 4: Pengujian Konektivitas Database Native
Jalankan verifikasi koneksi dan migrasi Drizzle dari shell lokal:
```powershell
# 1. Hentikan container app lama (tetap nyalakan db dan backup)
docker compose stop app kpi-tunnel
docker compose rm -f app kpi-tunnel

# 2. Uji compile dan typecheck native
npx tsc --noEmit

# 3. Uji migrasi drizzle langsung dari native ke port 5433
npm run typecheck
```

---

### Tahap 5: Menjalankan Aplikasi Secara Native

#### Mode A: Development (Interaktif)
Cocok untuk pengembangan sehari-hari:
```powershell
npm run dev
# Aplikasi aktif di http://localhost:3000 dengan Turbopack HMR instan
```

#### Mode B: Production (PM2 Process Manager)
Untuk server operasional non-stop, gunakan **PM2**:

1. Install PM2 secara global:
```powershell
npm install -g pm2
```

2. Buat konfigurasi `ecosystem.config.cjs`:
```javascript
module.exports = {
  apps: [
    {
      name: "kpi-app",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "./",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
```

3. Build dan jalankan aplikasi:
```powershell
# Build bundle produksi
npm run build

# Start via PM2
pm2 start ecosystem.config.cjs

# Simpan state agar auto-start saat reboot
pm2 save
```

---

### Tahap 6: Penyesuaian Cloudflare Tunnel

Untuk mengarahkan domain publik (`kpi.noviana.app`) ke aplikasi native di `localhost:3000`:

#### Pilihan 1: Cloudflare Tunnel Tetap di Docker
Jika container `kpi-tunnel` tetap digunakan di Docker, sesuaikan `cloudflared/config.yml`:
```yaml
tunnel: dc6960bf-c1c8-451c-9684-4a68b7f3ab71
credentials-file: /etc/cloudflared/credentials.json
protocol: http2

ingress:
  - hostname: kpi.noviana.app
    # Arahkan ke host Windows tempat aplikasi native berjalan
    service: http://host.docker.internal:3000
  - service: http_status:404
```

#### Pilihan 2: Cloudflare Tunnel Berjalan Native
Jalankan cloudflared binary langsung di Windows:
```powershell
cloudflared tunnel --config ./cloudflared/config.yml run
```
Dengan service target langsung ke `http://127.0.0.1:3000`.

---

## 5. Rencana Pengujian & Verifikasi (Checklist)

> [!IMPORTANT]
> Lakukan pengujian berurutan setelah pemisahan stack dilakukan:

- [ ] **Koneksi Database**: Cek apakah data appraisal dan master employee terbaca utuh.
- [ ] **Autentikasi Odoo**: Cek fungsi login NIK `1.1025.273` dan sinkronisasi role.
- [ ] **Export & Formula KPI**: Buka halaman penilaian bulanan dan uji download template Excel.
- [ ] **Reaktivitas Antar-Sheet**: Verifikasi bahwa file Excel yang diexport tetap otomatis mengkalkulasi ulang skor dan nilai akhir saat kolom actual diubah.
- [ ] **Otomasi Backup**: Pastikan container `kpi-backup` tetap membuat arsip `.sql.gz` di direktori `backups/`.
- [ ] **Akses Publik**: Verifikasi akses via domain `https://kpi.noviana.app` berjalan normal.

---

## 6. Rencana Rollback (Jika Ditemukan Kendala)

Jika terjadi kendala pada environment native dan ingin kembali secepatnya ke mode All-in-Docker:

1. Simpan backup file `docker-compose.yml.bak` sebelum eksekusi.
2. Matikan proses native (`pm2 stop kpi-app` atau Ctrl+C).
3. Kembalikan file `docker-compose.yml` asli.
4. Jalankan ulang container:
```powershell
docker compose up -d app tunnel
```
Dalam waktu kurang dari 1 menit, seluruh sistem akan kembali berjalan di dalam container Docker seperti semula tanpa ada data yang hilang.

---

## 7. Catatan Perencanaan: Migrasi ke Server Linux (Referensi Masa Depan)

Jika di masa mendatang sistem dipindahkan ke server Linux/Ubuntu:
1. **Database & Backup**: Gunakan `docker-compose.yml` yang sama (menjalankan PostgreSQL port 5433 dan container backup).
2. **Next.js Native via systemd**:
   - Service file `/etc/systemd/system/kpi-app.service`:
```ini
[Unit]
Description=KPI Management Next.js Native App
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/var/www/template
ExecStart=/usr/bin/node --env-file=.env.local .next_fresh/standalone/server.js
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
3. **Cloudflare Tunnel Native via systemd**:
   - Service file `/etc/systemd/system/cloudflared-kpi.service`:
```ini
[Unit]
Description=Cloudflare Tunnel KPI Native
After=network-online.target kpi-app.service

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
4. **Konfigurasi Tunnel Linux** (`/etc/cloudflared/config.yml`):
   - Sesuaikan path credentials file ke `/etc/cloudflared/credentials.json` dengan ingress service `http://127.0.0.1:3000`.
