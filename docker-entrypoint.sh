#!/bin/bash
set -e

echo "=== [KPI APP] Memulai Kontainer Aplikasi ==="

# 1. Jalankan validasi rahasia pre-flight
if [ -f "./scripts/validate-secrets.js" ]; then
  node ./scripts/validate-secrets.js
fi

# 2. Tunggu koneksi PostgreSQL siap jika POSTGRES_USER disetel
if [ -n "$POSTGRES_USER" ] && [ -n "$POSTGRES_DB" ]; then
  echo "=== [KPI APP] Memeriksa Kesiapan Database PostgreSQL ==="
  DB_HOST="${POSTGRES_HOST:-kpi-postgres}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; do
    echo "Menunggu database siap di $DB_HOST:$DB_PORT..."
    sleep 2
  done
  echo "✓ Database PostgreSQL terhubung dan siap."
fi

# 3. Jalankan migrasi database HANYA jika disetujui secara eksplisit via AUTO_MIGRATE=true
# Melindungi 1.707 data karyawan dan 34 tabel eksisting dari perubahan skema otomatis tanpa verifikasi
if [ "$AUTO_MIGRATE" = "true" ] && [ -f "./scripts/run-production-migration.js" ]; then
  echo "=== [KPI APP] Menjalankan Pre-Flight Database Migration (AUTO_MIGRATE=true) ==="
  node ./scripts/run-production-migration.js
else
  echo "ℹ️ [KPI APP] Migrasi database otomatis dilewati (AUTO_MIGRATE!=true). Integritas database eksisting terlindungi."
fi

echo "=== [KPI APP] Memulai Next.js Standalone Server ==="
exec "$@"
