#!/bin/bash
# Deployment aplikasi KPI Noviana (hanya mengelola docker-compose.app.yml).
set -Eeuo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.app.yml"
CONTAINER_NAME="kpi-app"
HEALTH_URL="http://127.0.0.1:3000/api/health"
ROLLBACK_IN_PROGRESS=0

check_container_health() {
  local attempts="$1"
  local i
  for i in $(seq 1 "$attempts"); do
    if docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "true" && \
       docker exec "$CONTAINER_NAME" curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    echo "Menunggu healthcheck dari dalam container ($i/$attempts)..."
    sleep 5
  done
  return 1
}

rollback() {
  # Matikan errexit di dalam rollback agar proses pemulihan tidak terputus di tengah jalan.
  set +e
  if [ "$ROLLBACK_IN_PROGRESS" -eq 1 ]; then
    return
  fi
  ROLLBACK_IN_PROGRESS=1
  trap - ERR

  echo "ERROR: Deployment gagal pada tahap aktivasi container. Menampilkan 50 baris log terakhir:"
  docker logs --tail 50 "$CONTAINER_NAME" 2>&1 || true

  if docker image inspect kpi-app:previous >/dev/null 2>&1; then
    echo "Memulai rollback otomatis ke image kpi-app:previous..."
    docker tag kpi-app:previous kpi-app:latest
    $COMPOSE up -d --no-build --force-recreate

    if check_container_health 12; then
      echo "ROLLBACK BERHASIL: Container $CONTAINER_NAME kembali berjalan sehat dengan versi sebelumnya."
    else
      echo "KRITIS: Rollback telah dijalankan, namun container belum merespons sehat di $HEALTH_URL."
    fi
  else
    echo "PERINGATAN: Image cadangan kpi-app:previous tidak ditemukan, melewati rollback."
  fi

  exit 1
}

# Tahap 1: Pre-flight (jika gagal di tahap ini, container yang sedang berjalan tidak disentuh).
docker network inspect kpi-network >/dev/null 2>&1 || docker network create kpi-network >/dev/null
$COMPOSE config --quiet

echo "Menarik kode terbaru dari repository..."
git pull --ff-only

# Simpan image dari container yang sedang berjalan (atau kpi-app:latest) sebagai cadangan rollback.
PREV_IMAGE_ID=$(docker inspect -f '{{.Image}}' "$CONTAINER_NAME" 2>/dev/null || true)
if [ -z "$PREV_IMAGE_ID" ]; then
  PREV_IMAGE_ID=$(docker image inspect -f '{{.Id}}' kpi-app:latest 2>/dev/null || true)
fi

if [ -n "$PREV_IMAGE_ID" ]; then
  docker tag "$PREV_IMAGE_ID" kpi-app:previous
  echo "Image aktif ($PREV_IMAGE_ID) disimpan sebagai kpi-app:previous."
fi

# Tahap 2: Build image baru (jika gagal, container produksi lama tetap berjalan normal).
echo "Membangun image baru kpi-app:latest..."
$COMPOSE build

# Tahap 3: Aktivasi container baru & verifikasi healthcheck (aktifasi trap rollback).
trap 'rollback' ERR

echo "Menjalankan container baru $CONTAINER_NAME..."
$COMPOSE up -d --no-build

if check_container_health 24; then
  trap - ERR
  echo "DEPLOYMENT BERHASIL: $(git log -1 --oneline) aktif dan sehat di $HEALTH_URL."
  exit 0
fi

echo "Container gagal melewati healthcheck dalam 120 detik."
rollback
