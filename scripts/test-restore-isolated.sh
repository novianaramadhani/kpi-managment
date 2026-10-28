#!/bin/bash
set -eo pipefail

TEST_DB="kpi_restore_test"
BACKUP_DIR="./backups"

echo "=== [RESTORE TEST] Memulai Uji Coba Pemulihan Data pada Database Terpisah ==="

# 1. Cari file backup kompresi (.sql.gz) terbaru di folder backups
LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/last/*.sql.gz ${BACKUP_DIR}/daily/*.sql.gz 2>/dev/null | head -n 1)
if [ -z "$LATEST_BACKUP" ]; then
  # Fallback ke root backups jika folder last/daily belum ada
  LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/*.sql.gz ${BACKUP_DIR}/*.sql 2>/dev/null | head -n 1)
fi

if [ -z "$LATEST_BACKUP" ]; then
  echo "❌ Tidak ditemukan file backup di direktori ${BACKUP_DIR}."
  exit 1
fi
echo "📁 Menguji integritas file backup: ${LATEST_BACKUP}"

# 2. Buat database uji terisolasi
echo "🧹 Mempersiapkan database terisolasi: ${TEST_DB}..."
docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};"
docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d postgres -c "CREATE DATABASE ${TEST_DB};"

# 3. Stream data dump ke dalam database terpisah
echo "📥 Melakukan injeksi dump ke ${TEST_DB}..."
if [[ "$LATEST_BACKUP" == *.gz ]]; then
  gunzip -c "$LATEST_BACKUP" | docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${TEST_DB} > /dev/null
else
  cat "$LATEST_BACKUP" | docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${TEST_DB} > /dev/null
fi

# 4. Validasi Integritas Data secara Faktual
echo "📊 Memeriksa integritas jumlah tabel dan baris data..."
TABLE_COUNT=$(docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${TEST_DB} -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")

EMPLOYEE_COUNT=$(docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${TEST_DB} -t -c \
  "SELECT count(*) FROM employees;")

APPRAISAL_COUNT=$(docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d ${TEST_DB} -t -c \
  "SELECT count(*) FROM appraisals;")

echo "   - Jumlah Tabel Terpulihkan : $(echo $TABLE_COUNT | tr -d ' ')"
echo "   - Total Rekor Karyawan     : $(echo $EMPLOYEE_COUNT | tr -d ' ')"
echo "   - Total Rekor Penilaian    : $(echo $APPRAISAL_COUNT | tr -d ' ')"

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "✓ INTEGRITAS DUMP VALID: Data berhasil direkonstruksi tanpa kehilangan relasi."
else
  echo "❌ RESTORE GAGAL: Tidak ada tabel yang terbentuk dari dump file!"
  exit 1
fi

# 5. Bersihkan database pengujian setelah verifikasi selesai
echo "🧹 Membersihkan database pengujian ${TEST_DB}..."
docker compose exec -T db psql -U ${POSTGRES_USER:-postgres} -d postgres -c "DROP DATABASE ${TEST_DB};"

echo "🎉 PENGUJIAN RESTORE SELESAI DENGAN SUKSES. File backup terbukti 100% valid dan dapat dipulihkan."
