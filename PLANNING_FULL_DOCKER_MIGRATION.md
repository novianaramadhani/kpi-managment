# Dokumen Rencana Arsitektur & Migrasi: Full Docker Dual Environment
## Sistem KPI Management (Next.js 16 + PostgreSQL 16 + Drizzle ORM + Cloudflare Tunnel)
### Lingkungan: Windows (Development) & Ubuntu Server (Production)

---

## 1. Audit Seluruh Berkas Project

Sesuai instruksi kerja, berikut adalah hasil audit menyeluruh terhadap berkas konfigurasi, orkestrasi, dan infrastruktur sebelum dilakukan perubahan:

| Kategori | Nama Berkas | Status Tindakan | Penjelasan Peran & Alasan |
| :--- | :--- | :--- | :--- |
| **Orkestrasi** | `docker-compose.db.yml` | **Dibuat / Disesuaikan** | Stack terpisah PostgreSQL 16. Menggunakan network `kpi-network`, volume `${DB_VOLUME_NAME:-template_kpi_postgres_data}`, port 5432 internal, port 5433 loopback host. |
| **Orkestrasi** | `docker-compose.backup.yml` | **Dibuat / Disesuaikan** | Stack terpisah auto-backup harian (`prodrigestivill/postgres-backup-local:16-alpine`) ke `./backups`. Terisolasi dari lifecycle app. |
| **Orkestrasi** | `docker-compose.app.yml` | **Dibuat / Disesuaikan** | Stack terpisah Next.js 16 Standalone. Mendukung konfigurasi dinamis `${APP_ENV_FILE}` dan `${APP_PORT}`, volume `./public/uploads`, non-root user, healthcheck, tanpa Cloudflare Tunnel. |
| **Environment** | `.env.development.example` | **Dibuat** | Dokumentasi template variabel lingkungan khusus Windows Development Docker. |
| **Environment** | `.env.development` | **Dibuat** | Berkas konfigurasi aktif Windows Development Docker (database internal `kpi-postgres:5432`, Odoo dev, secret lokal). |
| **Environment** | `.env.production.example` | **Dibuat** | Dokumentasi template variabel lingkungan khusus Ubuntu Server Production. |
| **Environment** | `.env.example` | **Diperbarui** | Dokumentasi master seluruh variabel lingkungan project tanpa memuat nilai rahasia. |
| **Infrastruktur** | `cloudflared/config.ubuntu.example.yml` | **Dibuat** | Contoh konfigurasi native Cloudflare Tunnel di Ubuntu (`/etc/cloudflared/config.yml`) yang mengarah ke `http://127.0.0.1:3000`. |
| **Infrastruktur** | `cloudflared/cloudflared.service.example` | **Dibuat** | Unit service systemd untuk mengelola daemon Cloudflare Tunnel native di Ubuntu Server. |
| **Infrastruktur** | `cloudflared/kpi-app.service.example` | **Dibuat** | Unit service systemd untuk referensi rollback aplikasi native lama di Ubuntu Server. |
| **Container** | `Dockerfile` | **Dipertahankan** | Multi-stage build (deps, builder, runner), Node.js 22 Alpine, Next.js Standalone output (`.next_fresh`), non-root user `nextjs:nodejs`. |
| **Container** | `docker-entrypoint.sh` | **Disesuaikan** | Mematikan auto-migration tak berizin (`AUTO_MIGRATE=false` by default) demi menjaga 1.707 data karyawan, audit rahasia, wait-for-db. |
| **Container** | `.dockerignore` | **Diperbarui** | Mengecualikan cache, node_modules, git, berkas `.env*`, dan direktori `uploads/` agar tidak membengkakkan image. |
| **Build & Config** | `next.config.ts` | **Dipertahankan** | Standalone mode (`distDir: ".next_fresh"`), allowedOrigins, security headers. |
| **Build & Config** | `package.json` | **Dipertahankan** | Skrip build, postbuild aset standalone (`scripts/copy-standalone-assets.js`), dependensi runtime. |
| **Bisnis & Data** | `src/app/**`, `src/lib/**`, `src/db/**` | **Dipertahankan 100%** | Seluruh logika bisnis KPI, autentikasi Odoo/JWT, scoring bulanan, dan approval workflow dipertahankan tanpa perubahan. |
| **Data Persistent** | Volume `template_kpi_postgres_data` | **Dipertahankan 100%** | Volume PostgreSQL yang menyimpan 1.707 data karyawan dan 34 tabel public tidak boleh direset atau diganti. |

---

## 2. Prinsip Arsitektur Dual Environment

Sistem dirancang untuk beroperasi secara konsisten di dua lingkungan dengan isolasi total:

```
+--------------------------------------------------------------------------------------------------------------------+
|                                    PERBANDINGAN ARSITEKTUR DUAL ENVIRONMENT                                        |
+------------------------------------+---------------------------------------+---------------------------------------+
| PARAMETER ARSITEKTUR               | 1. WINDOWS (DEVELOPMENT ENVIRONMENT)  | 2. UBUNTU SERVER (PRODUCTION)         |
+------------------------------------+---------------------------------------+---------------------------------------+
| Model Deployment                   | Full Docker (Compose Terpisah)        | Full Docker (Compose Terpisah)        |
| PostgreSQL Database (16)           | Docker: kpi-postgres                  | Docker: kpi-postgres                  |
| Volume Persistent Database         | template_kpi_postgres_data (Lokal)   | Volume Terverifikasi Ubuntu Server    |
| Port Akses Database Host           | 127.0.0.1:5433 (DBeaver / Script CLI) | 127.0.0.1:5433 (SSH Tunnel / Admin)   |
| Isolasi Database                   | Mandiri di PC Windows (Lokal)         | Mandiri di Server Ubuntu (Produksi)   |
| Database Production Impact         | ZERO IMPACT (Tidak pernah terhubung)  | Terlindungi & Terisolasi Penuh        |
| Aplikasi Web (Next.js 16.2.6)      | Docker: kpi-app (Standalone)          | Docker: kpi-app (Standalone)          |
| Port Internal Docker App           | 3000                                  | 3000                                  |
| Port Host Aplikasi Web             | 127.0.0.1:3000 (Loopback Lokal)       | 127.0.0.1:3000 (Canary Uji: 3001)     |
| Berkas Environment                 | .env.development                      | .env.production (chmod 600)           |
| Backup Otomatis Database           | Docker: kpi-backup ke ./backups       | Docker: kpi-backup ke ./backups       |
| Cloudflare Tunnel                  | Native CLI Windows (Bisa Dimatikan)   | Native via systemd (cloudflared)      |
| Domain Akses Publik                | Localhost / Tunnel Uji Coba           | https://kpi.noviana.app (Domain Tetap)|
| Terminasi HTTPS                    | Browser / Cloudflare                  | Cloudflare Global Edge SSL (Managed)  |
| Protokol Tunnel ke Docker App      | HTTP Internal (127.0.0.1:3000)        | HTTP Internal (127.0.0.1:3000)        |
| Atribut Cookie Autentikasi         | HttpOnly, SameSite=Lax                | Secure, HttpOnly, SameSite=Lax        |
| Header Forwarding                  | Host / Forwarded                      | X-Forwarded-Proto: https              |
| Mekanisme Jaringan Docker          | kpi-network (External Bridge)         | kpi-network (External Bridge)         |
+------------------------------------+---------------------------------------+---------------------------------------+
```

---

## 3. Diagram Topologi Jaringan & Data Flow

### 3.1 Lingkungan 1: Windows (Development Environment)
```
+----------------------------------------------------------------------------------------+
|                            WINDOWS HOST (DEVELOPMENT MACHINE)                          |
|                                                                                        |
|   +------------------------------------+    +--------------------------------------+   |
|   | STACK 1: DB (docker-compose.db.yml)|    | STACK 2: APP (docker-compose.app.yml)|   |
|   | Container: kpi-postgres (Port 5432)|    | Container: kpi-app (Port 3000)       |   |
|   | Volume: template_kpi_postgres_data |<---+ Host Port: 127.0.0.1:3000            |   |
|   | Host Port: 127.0.0.1:5433 (Admin)  |    | Env: .env.development                |   |
|   +------------------+-----------------+    +------------------+-------------------+   |
|                      |                                         |                       |
|   +------------------+-----------------+                       |                       |
|   | STACK 3: BACKUP                    |                       |                       |
|   | (docker-compose.backup.yml)        |                       |                       |
|   | Container: kpi-backup              |                       |                       |
|   +------------------+-----------------+                       |                       |
|                      |                                         |                       |
|                      +--------------------+--------------------+                       |
|                                           |                                            |
|                                DOCKER NETWORK: kpi-network                             |
+-------------------------------------------+--------------------------------------------+
                                            |
                                Akses Langsung Browser Lokal:
                                    http://localhost:3000
```

### 3.2 Lingkungan 2: Ubuntu Server (Production Environment)
```
+----------------------------------------------------------------------------------------+
|                                UBUNTU PRODUCTION SERVER                                |
|                                                                                        |
|   +------------------------------------+    +--------------------------------------+   |
|   | STACK 1: DB (docker-compose.db.yml)|    | STACK 2: APP (docker-compose.app.yml)|   |
|   | Container: kpi-postgres (Port 5432)|    | Container: kpi-app (Port 3000)       |   |
|   | Volume: template_kpi_postgres_data |<---+ Internal Port: 3000                  |   |
|   | (1.707 Karyawan & 34 Tabel Public) |    | Host Port: 127.0.0.1:3000 (3001 Test)|   |
|   | Host Port: 127.0.0.1:5433 (Local)  |    | Env: .env.production                 |   |
|   +------------------+-----------------+    +------------------+-------------------+   |
|                      |                                         ^                       |
|   +------------------+-----------------+                       |                       |
|   | STACK 3: BACKUP                    |                       | Loopback HTTP         |
|   | (docker-compose.backup.yml)        |                       | 127.0.0.1:3000        |
|   | Container: kpi-backup              |                       |                       |
|   | Target: kpi-postgres:5432          |                       |                       |
|   | Output: ./backups (*.sql.gz)       |                       |                       |
|   +------------------+-----------------+                       |                       |
|                      |                                         |                       |
|                      +--------------------+                    |                       |
|                                           |                    |                       |
|                                DOCKER NETWORK: kpi-network     |                       |
+----------------------------------------------------------------|-----------------------+
                                                                 |
                                 Koneksi Terenkripsi Outbound Tunnel
                                                                 |
                                                                 v
                                 +-----------------------------------------------+
                                 | STACK 4: INGRESS NATIVE (UBUNTU HOST)         |
                                 |                                               |
                                 | Cloudflare Tunnel Service (cloudflared.service|
                                 | - Ingress Target: http://127.0.0.1:3000       |
                                 | - Header: X-Forwarded-Proto: https            |
                                 | - Tunnel ID: dc6960bf-c1c8-451c-9684-4a68b... |
                                 +-----------------------+-----------------------+
                                                         |
                                                         v
                                         Cloudflare Global Edge Network
                                         - Managed SSL/TLS Certificate
                                         - DDoS Protection & Security Shield
                                                         |
                                                         v
                                          Akses Pengguna / Browser Publik:
                                              https://kpi.noviana.app
```

---

## 4. Spesifikasi Berkas Docker Compose Bersama

Kedua lingkungan menggunakan berkas Docker Compose yang **identik secara struktural** dengan parameter dinamis:

### 4.1 Database Compose (`docker-compose.db.yml`)
```yaml
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
      # Port 5433 di-bind ke 127.0.0.1 loopback host untuk administrasi lokal (DBeaver / CLI)
      - "127.0.0.1:5433:5432"
    networks:
      kpi-network:
        aliases:
          - db
          - kpi-postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-kpi_app}"]
      interval: 5s
      timeout: 5s
      retries: 5
      start_period: 10s
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2048M
        reservations:
          cpus: "0.5"
          memory: 512M
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"

volumes:
  kpi_postgres_data:
    name: ${DB_VOLUME_NAME:-template_kpi_postgres_data}

networks:
  kpi-network:
    external: true
    name: kpi-network
```

### 4.2 Backup Compose (`docker-compose.backup.yml`)
```yaml
services:
  backup:
    image: prodrigestivill/postgres-backup-local:16-alpine
    container_name: kpi-backup
    restart: unless-stopped
    volumes:
      - ./backups:/backups
    environment:
      POSTGRES_HOST: kpi-postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: ${POSTGRES_DB:-kpi_app}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      SCHEDULE: ${BACKUP_SCHEDULE:-@daily}
      BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-14}
      BACKUP_SUFFIX: ".sql.gz"
      POSTGRES_EXTRA_OPTS: "-Z6 --schema=public --blobs"
    networks:
      - kpi-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

networks:
  kpi-network:
    external: true
    name: kpi-network
```

### 4.3 Aplikasi Next.js Compose (`docker-compose.app.yml`)
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: kpi-app:latest
    container_name: kpi-app
    restart: unless-stopped
    env_file:
      - ${APP_ENV_FILE:-.env.production}
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3000
      HOSTNAME: "0.0.0.0"
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@kpi-postgres:5432/${POSTGRES_DB:-kpi_app}
      POSTGRES_HOST: kpi-postgres
      POSTGRES_PORT: 5432
      NODE_OPTIONS: "--max-old-space-size=1536"
    ports:
      # Port loopback host: Windows (3000), Ubuntu Canary (3001), Ubuntu Prod (3000)
      - "127.0.0.1:${APP_PORT:-3000}:3000"
    volumes:
      # Persistent volume upload evidence
      - ./public/uploads:/app/public/uploads
    networks:
      - kpi-network
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://127.0.0.1:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 2048M
        reservations:
          cpus: "0.25"
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"

networks:
  kpi-network:
    external: true
    name: kpi-network
```

---

## 5. Keamanan Autentikasi & Cookie (`Secure`, `HttpOnly`, `SameSite=Lax`)

Konfigurasi autentikasi pada [`src/lib/auth.ts`](file:///c:/Users/Noviana%20Ramadhani/Documents/template/src/lib/auth.ts#L346-L352) tidak diubah dan bekerja sebagai berikut:
```typescript
cookieStore.set("kpi_user_session", token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 8, // 8 jam
});
```

### 5.1 Perilaku di Ubuntu Production
1. Pengguna membuka URL `https://kpi.noviana.app` (HTTPS Publik).
2. Cloudflare Edge mengenkripsi trafik publik dan meneruskannya ke host Ubuntu via Tunnel.
3. Cloudflare menyertakan header standar proxy:
   * `X-Forwarded-Proto: https`
   * `X-Forwarded-Host: kpi.noviana.app`
4. Next.js menerima request dan menyetel cookie dengan atribut:
   * **`HttpOnly`**: Mencegah pencurian token sesi via serangan XSS.
   * **`Secure`**: Wajib aktif karena skema origin di browser adalah HTTPS.
   * **`SameSite=Lax`**: Mencegah eksploitasi CSRF pada request lintas situs.
5. Browser menerima dan menyimpan cookie secara valid. Redirect ke `/dashboard` berjalan mulus tanpa terjadi redirect loop login.

### 5.2 Perilaku di Windows Development
- Saat pengujian lokal di Windows melalui `http://localhost:3000`, standar browser modern (W3C Secure Context) memperlakukan `localhost` dan `127.0.0.1` sebagai **Trustworthy Origin (Secure Context)**, sehingga cookie sesi tetap diterima dan dapat diuji secara lokal.

---

## 6. Perlindungan Data Produksi (1.707 Karyawan & 34 Tabel)

> [!CAUTION]
> **ATURAN MUTLAK KESELAMATAN DATA:**
> 1. Jangan pernah menjalankan `docker compose down -v` di lingkungan produksi.
> 2. Database development Windows **TIDAK PERNAH** terhubung ke database production Ubuntu.
> 3. Lakukan backup manual (`.sql.gz`) sebelum memulai migrasi di Ubuntu.
> 4. `AUTO_MIGRATE=false` disetel secara default pada berkas environment produksi.

### Skrip Entrypoint (`docker-entrypoint.sh`)
Skrip entrypoint telah dilengkapi pengaman ketat:
```bash
if [ "$AUTO_MIGRATE" = "true" ] && [ -f "./scripts/run-production-migration.js" ]; then
  echo "=== [KPI APP] Menjalankan Pre-Flight Database Migration (AUTO_MIGRATE=true) ==="
  node ./scripts/run-production-migration.js
else
  echo "ℹ️ [KPI APP] Migrasi database otomatis dilewati (AUTO_MIGRATE!=true). Integritas database eksisting terlindungi."
fi
```
Ini memastikan 1.707 data karyawan dan 34 tabel public tidak akan diubah atau dimigrasi secara otomatis saat kontainer booting.

---

## 7. Prosedur Pengujian & Validasi di Windows Development

Sebelum kode di-push ke GitHub, seluruh stack Full Docker wajib diuji dan berhasil 100% di Windows:

```powershell
# 1. Pastikan Docker Desktop di Windows dalam keadaan aktif
docker info

# 2. Buat external network kpi-network di Windows jika belum ada
docker network create kpi-network

# 3. Jalankan Stack Database PostgreSQL di Windows
docker compose -f docker-compose.db.yml up -d

# 4. Verifikasi status kesehatan database kpi-postgres
docker compose -f docker-compose.db.yml ps
# Pastikan status bertuliskan: Up (healthy)

# 5. Jalankan Stack Backup di Windows
docker compose -f docker-compose.backup.yml up -d

# 6. Uji coba backup manual on-demand di Windows
docker exec -it kpi-backup /backup.sh
Get-ChildItem -Path .\backups\

# 7. Build dan Jalankan Aplikasi Next.js di Windows menggunakan .env.development
$env:APP_ENV_FILE=".env.development"
docker compose -f docker-compose.app.yml build
docker compose -f docker-compose.app.yml up -d

# 8. Pantau log booting kontainer
docker compose -f docker-compose.app.yml logs -f app

# 9. Verifikasi endpoint healthcheck
curl -I http://127.0.0.1:3000/api/health

# 10. Uji coba fungsional via browser lokal:
# - Buka http://localhost:3000/login
# - Login menggunakan NIK 1.1025.273 (Superadmin)
# - Verifikasi dashboard terbuka, modul KPI terbaca, dan koneksi database lokal sukses.
```

---

## 8. Prosedur Deployment & Canary di Ubuntu Server

Setelah pengujian di Windows terbukti berhasil, lanjutkan proses deployment ke Ubuntu Server:

### Tahap 1: Push dari Windows ke GitHub
```powershell
git status
git add Dockerfile docker-compose.db.yml docker-compose.backup.yml docker-compose.app.yml docker-entrypoint.sh .dockerignore .env.example .env.production.example .env.development.example cloudflared/ PLANNING_FULL_DOCKER_MIGRATION.md
git commit -m "feat(infra): full docker decoupled compose supporting windows dev and ubuntu prod"
git push origin main
```

### Tahap 2: Pull di Ubuntu Server
```bash
cd /path/to/kpi-project
git fetch origin
git checkout main
git pull origin main
```

### Tahap 3: Persiapan Network & Direktori di Ubuntu
```bash
docker network inspect kpi-network >/dev/null 2>&1 || docker network create kpi-network
mkdir -p backups public/uploads
```

### Tahap 4: Backup Penuh Database Produksi Eksisting
```bash
# Lakukan backup keselamatan sebelum menyentuh kontainer apa pun
docker exec -it kpi-backup /backup.sh
ls -lh ./backups/
```

### Tahap 5: Jalankan Stack DB & Backup di Ubuntu
```bash
# Pastikan DB terhubung ke kpi-network menggunakan volume produksi terverifikasi
docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.backup.yml up -d
docker ps --filter "name=kpi-"
```

### Tahap 6: Konfigurasi `.env.production` di Ubuntu
```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Isi kredensial riil database produksi Ubuntu dan JWT_SECRET (>= 32 karakter)
nano .env.production
```

### Tahap 7: Canary Deployment di Port 3001 (Aplikasi Lama Tetap Hidup)
```bash
# 1. Build image Docker di Ubuntu
docker compose -f docker-compose.app.yml build

# 2. Jalankan di port canary 3001
APP_PORT=3001 docker compose -f docker-compose.app.yml up -d

# 3. Pantau log kontainer
docker compose -f docker-compose.app.yml logs -f app

# 4. Verifikasi healthcheck port 3001
curl -I http://127.0.0.1:3001/api/health
```

### Tahap 8: Pengalihan Trafik & Cloudflare Tunnel Native di Ubuntu
Setelah verifikasi port 3001 sukses:
1. **Pindahkan Kontainer Docker ke Port Produksi 3000**:
   ```bash
   # Hentikan aplikasi lama yang dikelola systemd
   sudo systemctl stop kpi-app

   # Jalankan kontainer Docker pada port 3000
   APP_PORT=3000 docker compose -f docker-compose.app.yml up -d
   ```
2. **Pasang & Aktifkan Cloudflare Tunnel Native di Ubuntu**:
   ```bash
   # Pasang cloudflared jika belum ada
   curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /etc/apt/trusted.gpg.d/cloudflare.gpg
   echo 'deb [signed-by=/etc/apt/trusted.gpg.d/cloudflare.gpg] https://pkg.cloudflare.com/cloudflared focal main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
   sudo apt-get update && sudo apt-get install -y cloudflared

   # Salin kredensial dan konfigurasi
   sudo mkdir -p /etc/cloudflared
   sudo cp cloudflared/config.ubuntu.example.yml /etc/cloudflared/config.yml
   # (Pastikan credentials.json sudah ada di /etc/cloudflared/credentials.json dengan chmod 600)
   sudo chmod 600 /etc/cloudflared/credentials.json

   # Matikan tunnel lama di Windows, lalu jalankan tunnel di Ubuntu
   sudo cloudflared service install
   sudo systemctl enable cloudflared
   sudo systemctl start cloudflared
   sudo systemctl status cloudflared
   ```
3. **Pengujian Akhir pada Domain Utama ([`https://kpi.noviana.app`](https://kpi.noviana.app))**:
   - Login NIK & PIN.
   - Periksa persistensi cookie `Secure` & `HttpOnly`.
   - Navigasi Dashboard, Input KPI, Review Penilai, dan upload attachment evidence.

---

## 9. Prosedur Rollback ke Aplikasi Lama (Systemd)

Jika ditemukan masalah pada kontainer Docker aplikasi di Ubuntu:
```bash
# 1. Matikan kontainer Docker aplikasi
docker compose -f docker-compose.app.yml stop

# 2. Nyalakan kembali aplikasi native lama yang dikelola systemd
sudo systemctl restart kpi-app

# 3. Periksa status layanan native lama
sudo systemctl status kpi-app

# 4. Verifikasi bahwa https://kpi.noviana.app kembali normal melayani pengguna
curl -I https://kpi.noviana.app/login
```
Karena database PostgreSQL dan backup berjalan di kontainer terpisah, data tidak mengalami perubahan atau kerusakan sama sekali.
