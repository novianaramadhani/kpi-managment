#!/bin/bash
# Uji pemulihan file backup terbaru ke database sementara (kpi_restore_test) tanpa menyentuh database utama.
set -eo pipefail

cd "$(dirname "$0")/.."
COMPOSE_DB="docker compose -f docker-compose.db.yml"
TEST_DB="kpi_restore_test"
BACKUP_DIR="./backups"

echo "=== [RESTORE TEST] Memulai Uji Coba Pemulihan Data pada Database Terpisah ==="

LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/last/*.sql.gz ${BACKUP_DIR}/daily/*.sql.gz 2>/dev/null | head -n 1 || true)
if [ -z "$LATEST_BACKUP" ]; then
  LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/*.sql.gz ${BACKUP_DIR}/*.sql 2>/dev/null | head -n 1 || true)
fi

if [ -z "$LATEST_BACKUP" ]; then
  echo "Tidak ditemukan file backup di direktori ${BACKUP_DIR}."
  exit 1
fi
echo "Menguji integritas file backup: ${LATEST_BACKUP}"

echo "Mempersiapkan database terisolasi: ${TEST_DB}..."
$COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"
$COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "CREATE DATABASE ${TEST_DB};"

echo "Melakukan injeksi dump ke ${TEST_DB}..."
if [[ "$LATEST_BACKUP" == *.gz ]]; then
  gunzip -c "$LATEST_BACKUP" | $COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${TEST_DB}" > /dev/null
else
  cat "$LATEST_BACKUP" | $COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${TEST_DB}" > /dev/null
fi

echo "Memeriksa integritas jumlah tabel dan baris data..."
TABLE_COUNT=$($COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${TEST_DB}" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d '[:space:]')

EMPLOYEE_COUNT=$($COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${TEST_DB}" -t -c \
  "SELECT count(*) FROM employees;" | tr -d '[:space:]')

APPRAISAL_COUNT=$($COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "${TEST_DB}" -t -c \
  "SELECT count(*) FROM appraisals;" | tr -d '[:space:]')

echo "   - Jumlah Tabel Terpulihkan : ${TABLE_COUNT}"
echo "   - Total Rekor Karyawan     : ${EMPLOYEE_COUNT}"
echo "   - Total Rekor Penilaian    : ${APPRAISAL_COUNT}"

$COMPOSE_DB exec -T db psql -U "${POSTGRES_USER:-postgres}" -d postgres -c "DROP DATABASE ${TEST_DB};"

if [ "${TABLE_COUNT:-0}" -gt 0 ]; then
  echo "INTEGRITAS DUMP VALID: File backup dapat dipulihkan."
else
  echo "RESTORE GAGAL: Tidak ada tabel yang terbentuk dari dump file."
  exit 1
fi
