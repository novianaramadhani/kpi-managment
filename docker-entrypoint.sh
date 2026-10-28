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
  DB_HOST="${POSTGRES_HOST:-db}"
  DB_PORT="${POSTGRES_PORT:-5432}"
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; do
    echo "Menunggu database siap di $DB_HOST:$DB_PORT..."
    sleep 2
  done
  echo "✓ Database PostgreSQL terhubung dan siap."
fi

# 3. Jalankan migrasi database otomatis dengan advisory lock
if [ -f "./scripts/run-production-migration.js" ]; then
  echo "=== [KPI APP] Menjalankan Pre-Flight Database Migration ==="
  node ./scripts/run-production-migration.js
fi

echo "=== [KPI APP] Memulai Next.js Server ==="
exec "$@"
