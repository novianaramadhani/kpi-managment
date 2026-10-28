#!/bin/bash
set -eo pipefail

TARGET_TAG="$1"
if [ -z "$TARGET_TAG" ]; then
  echo "Penggunaan: ./scripts/deploy.sh <target-sha-tag>"
  echo "Contoh: ./scripts/deploy.sh sha-a1b2c3d"
  exit 1
fi

echo "=== [DEPLOY] Memulai deployment untuk image tag: ${TARGET_TAG} ==="

# 1. Simpan tag image yang saat ini aktif
CURRENT_TAG=$(grep '^APP_IMAGE_TAG=' .env 2>/dev/null | cut -d '=' -f2 || echo "latest")
echo "ℹ️ Image saat ini yang sedang aktif: ${CURRENT_TAG}"

# 2. Update .env dengan tag target baru
if grep -q '^APP_IMAGE_TAG=' .env 2>/dev/null; then
  sed -i "s/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=${TARGET_TAG}/" .env
else
  echo "APP_IMAGE_TAG=${TARGET_TAG}" >> .env
fi

# 3. Pull image target spesifik dari registry
echo "⬇️ Mengunduh image target..."
docker compose pull app

# 4. Terapkan update kontainer app (pre-flight migration akan berjalan otomatis via entrypoint)
echo "🚀 Merestart kontainer app..."
docker compose up -d --no-deps app

# 5. Healthcheck Verifikasi (Polling selama 60 detik)
echo "🔍 Menunggu verifikasi healthcheck aplikasi..."
HEALTHY=0
for i in {1..12}; do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health || true)
  if [ "$HTTP_STATUS" == "200" ]; then
    echo "✓ Healthcheck berhasil (HTTP 200) pada percobaan ke-$i."
    HEALTHY=1
    break
  fi
  echo "Menunggu respon sehat ($i/12)... status saat ini: $HTTP_STATUS"
  sleep 5
done

# 6. Evaluasi Keberhasilan atau Eksekusi Rollback
if [ "$HEALTHY" -eq 1 ]; then
  echo "🎉 DEPLOYMENT BERHASIL! Versi ${TARGET_TAG} aktif melayani trafik."
  exit 0
else
  echo "❌ CRITICAL: Aplikasi gagal merespons healthcheck dalam 60 detik!"
  echo "⚠️ MEMULAI ROLLBACK DETERMINISTIK ke versi sebelumnya: ${CURRENT_TAG}..."
  
  # Kembalikan file .env ke tag sebelumnya
  sed -i "s/^APP_IMAGE_TAG=.*/APP_IMAGE_TAG=${CURRENT_TAG}/" .env
  
  # Re-launch kontainer menggunakan image sebelumnya
  docker compose up -d --no-deps app
  
  sleep 5
  if curl -s -f http://127.0.0.1:3000/api/health | grep -q '"ok":true'; then
    echo "✓ ROLLBACK SUKSES. Sistem telah kembali stabil pada versi ${CURRENT_TAG}."
  else
    echo "🚨 EMERGENCY: Rollback otomatis membutuhkan intervensi admin manual!"
  fi
  
  exit 1
fi
