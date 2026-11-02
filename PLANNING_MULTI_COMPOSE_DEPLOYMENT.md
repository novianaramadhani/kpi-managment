# Dokumen Rencana Arsitektur Deployment Multi-Compose Docker

Dokumen ini memuat arsitektur teknis, spesifikasi compose terpisah (*Decoupled Docker Compose*), dan panduan implementasi untuk memindahkan sistem KPI Management ke server produksi (Linux VPS / Dedicated Server / On-Premise).

---

## 1. Filosofi & Alasan Pemisahan Compose

Pemisahan docker-compose menjadi dua berkas independen didasarkan pada prinsip **Pemisahan Tanggung Jawab (*Separation of Concerns*) antara Stateful & Stateless**:

```
+------------------------------------------------------------------------------------+
|                               SERVER PRODUKSI (LINUX)                              |
|                                                                                    |
|   +------------------------------------+   +------------------------------------+  |
|   | STACK 1: INFRASTRUCTURE (STATEFUL) |   | STACK 2: APPLICATION (STATELESS)   |  |
|   | File: docker-compose.infra.yml     |   | File: docker-compose.app.yml       |  |
|   |                                    |   |                                    |  |
|   | - PostgreSQL 16 (kpi-postgres)     |   | - Next.js Standalone (kpi-app)     |  |
|   | - Automated Backup (kpi-backup)    |   | - Cloudflare Tunnel (kpi-tunnel)   |  |
|   | - Persistent Volume Data           |   | - Web App Runtime                  |  |
|   | - Dijalankan sekali, jarang diubah |   | - Sering di-rebuild & di-update    |  |
|   +-----------------+------------------+   +-----------------+------------------+  |
|                     |                                        |                     |
|                     +-------------------+--------------------+                     |
|                                         |                                          |
|                          Docker Network: kpi-network (Bridge)                      |
+-----------------------------------------+------------------------------------------+
                                          |
                                Internet Publik via
                             Cloudflare Edge Network
```

### Keunggulan Arsitektur Multi-Compose:
1. **Zero Downtime Database saat Update Aplikasi**: Ketika melakukan rilis fitur baru atau update kode, hanya stack aplikasi yang di-rebuild dan di-restart (`docker compose -f docker-compose.app.yml up -d --build`). Database tetap menyala, koneksi pool aman, dan tidak ada risiko restart database yang tidak perlu.
2. **Keamanan Data Maksimal**: Database dan container backup berada dalam stack infrastruktur terisolasi. Port PostgreSQL (5432) tidak di-expose ke publik, melainkan hanya dapat diakses melalui Docker network internal `kpi-network`.
3. **Siklus Hidup (*Lifecycle*) yang Jelas**:
   - **Stack Infra**: Dinyalakan sekali saat setup server pertama kali, dilengkapi cron backup harian otomatis ke direktori arsip.
   - **Stack App**: Mengikuti siklus rilis Git (CI/CD atau manual pull).

---

## 2. Diagram Topologi Jaringan & Data Flow

```mermaid
flowchart TD
    subgraph Klien & Edge
        Browser["Pengguna / Browser Web"]
        CF["Cloudflare Global Network (Edge SSL/WAF)"]
        Browser -->|HTTPS / 443| CF
    end

    subgraph Server Linux Host
        subgraph Docker Bridge Network: kpi-network
            subgraph Stack 2: docker-compose.app.yml (Stateless)
                Tunnel["kpi-tunnel (cloudflare/cloudflared)\nKoneksi keluar aman ke Cloudflare Edge"]
                App["kpi-app (Next.js 16 Standalone)\nPort 3000 Internal\nNode.js 22 Runner"]
            end

            subgraph Stack 1: docker-compose.infra.yml (Stateful)
                DB[("kpi-postgres (PostgreSQL 16)\nPort 5432 Internal\nHealthcheck pg_isready")]
                Backup["kpi-backup (postgres-backup-local)\nCron Backup Harian: @daily"]
            end
        end

        subgraph Host Storage
            VolDB[("Volume Docker: kpi_postgres_data\n/var/lib/postgresql/data")]
            VolBackup["Folder Host: ./backups/\nFile *.sql.gz"]
        end

        DB --- VolDB
        Backup --- VolBackup
    end

    CF <==>|Encrypted Tunnel Daemon| Tunnel
    Tunnel -->|HTTP :3000| App
    App -->|Host: db:5432 / Drizzle ORM| DB
    Backup -->|pg_dump Host: db:5432| DB
```

---

## 3. Spesifikasi Berkas Compose

### 3.1 Stack 1: `docker-compose.infra.yml` (Database & Backup)

File ini menangani database PostgreSQL 16 dan container backup otomatis berkala:

```yaml
# docker-compose.infra.yml
services:
  db:
    image: postgres:16-alpine
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
      # Port 5433 hanya di-bind ke 127.0.0.1 host untuk administrasi lokal (SSH Tunnel / DBeaver)
      # Tidak dibuka ke 0.0.0.0 agar aman dari akses luar
      - "127.0.0.1:5433:5432"
    networks:
      - kpi-network
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
    networks:
      - kpi-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  kpi_postgres_data:
    name: kpi_postgres_data

networks:
  kpi-network:
    external: true
    name: kpi-network
```

---

### 3.2 Stack 2: `docker-compose.app.yml` (Aplikasi Next.js & Cloudflare Tunnel)

File ini menangani aplikasi Next.js (hasil build Dockerfile standalone) dan ingress Cloudflare Tunnel:

```yaml
# docker-compose.app.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: kpi-app:latest
    container_name: kpi-app
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-kpi_app}
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-kpi_app}
      AUTH_MODE: ${AUTH_MODE:-odoo}
      ODOO_BASE_URL: ${ODOO_BASE_URL}
      ODOO_API_VERSION: ${ODOO_API_VERSION:-v1}
      ODOO_ADMIN_USER: ${ODOO_ADMIN_USER}
      ODOO_ADMIN_PASSWORD: ${ODOO_ADMIN_PASSWORD}
      ODOO_SERVICE_NIK: ${ODOO_SERVICE_NIK}
      ODOO_SERVICE_PASSWORD: ${ODOO_SERVICE_PASSWORD}
      DEV_SUPERADMIN_NIK: ${DEV_SUPERADMIN_NIK}
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-8h}
      NODE_OPTIONS: "--max-old-space-size=1024"
    ports:
      # Opsional: expose port loopback untuk monitoring host internal
      - "127.0.0.1:3000:3000"
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
          memory: 1536M
        reservations:
          cpus: "0.25"
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "5"

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: kpi-tunnel
    restart: unless-stopped
    depends_on:
      app:
        condition: service_healthy
    volumes:
      - ./cloudflared:/etc/cloudflared:ro
    command: tunnel --config /etc/cloudflared/config.yml run
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

---

## 4. Panduan Eksekusi Deployment di Server Linux

Berikut adalah langkah-langkah praktis saat menyiapkan server produksi baru:

### Tahap 1: Persiapan Server & Jaringan Docker
Di terminal server Linux:
```bash
# 1. Pastikan Docker dan Docker Compose Plugin sudah terinstall
docker --version
docker compose version

# 2. Buat External Docker Network bersama (Langkah Wajib Pertama)
docker network create kpi-network

# 3. Buat folder untuk backup otomatis
mkdir -p ./backups
```

### Tahap 2: Menyalakan Stack 1 (Infrastruktur Database)
```bash
# Nyalakan PostgreSQL dan service backup
docker compose -f docker-compose.infra.yml up -d

# Cek status kesehatan database
docker compose -f docker-compose.infra.yml ps

# Tunggu hingga status kpi-postgres bertuliskan (healthy)
```

### Tahap 3: Migrasi / Seeding Database (Jika DB Baru)
```bash
# Dari host server, jalankan migrasi database ke container db yang sedang aktif
npm run typecheck
npx drizzle-kit push
```

### Tahap 4: Menyalakan Stack 2 (Aplikasi & Cloudflare Tunnel)
```bash
# Build image aplikasi dan jalankan container app + tunnel
docker compose -f docker-compose.app.yml up -d --build

# Cek log aplikasi untuk memastikan server Next.js telah berjalan lancar
docker compose -f docker-compose.app.yml logs -f app
```

---

## 5. SOP Operasional Harian di Server

### 5.1 Cara Melakukan Update Kode / Deploy Rilis Baru
Ketika ada perubahan kode di Git repository:
```bash
# 1. Ambil kode terbaru
git pull origin main

# 2. Rebuild dan restart HANYA stack aplikasi
docker compose -f docker-compose.app.yml up -d --build app

# Catatan: Database (kpi-postgres) sama sekali tidak terganggu dan tidak mengalami restart!
```

### 5.2 Cara Backup Database Manual On-Demand
Kapan pun sebelum melakukan perubahan besar, Anda dapat memicu backup instan:
```bash
docker exec -it kpi-backup /backup.sh
ls -lh ./backups/
```

### 5.3 Cara Restore Database dari File Backup
Jika ingin memulihkan database dari salah satu file `.sql.gz`:
```bash
# Contoh nama file: ./backups/kpi_app_2026-10-30.sql.gz
gunzip < ./backups/nama_file.sql.gz | docker exec -i kpi-postgres psql -U postgres -d kpi_app
```

---

## 6. Ringkasan Perbandingan Lingkungan

| Parameter | Lingkungan Saat Ini (Lokal Windows) | Lingkungan Target Server Produksi |
| :--- | :--- | :--- |
| **PostgreSQL** | Docker Container (`127.0.0.1:5433`) | Docker Compose Infra (`kpi-postgres` di `kpi-network`) |
| **Database Backup** | Docker Container (`kpi-backup`) | Docker Compose Infra (`kpi-backup` ke `./backups`) |
| **Aplikasi Next.js** | Native Node.js host (`node standalone/server.js`) | Docker Compose App (`kpi-app` via Dockerfile standalone) |
| **Cloudflare Tunnel** | Native Binary (`cloudflared.exe`) | Docker Compose App (`kpi-tunnel` container) |
| **Isolasi Rilis** | Manual terminal restart | `docker compose -f docker-compose.app.yml up -d --build` |
| **Koneksi DB App** | `127.0.0.1:5433` via host loopback | `db:5432` via Docker bridge network `kpi-network` |

