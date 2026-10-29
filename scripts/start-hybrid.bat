@echo off
setlocal
cd /d "C:\Users\Noviana Ramadhani\Documents\template"

echo ========================================================
echo  MEMULAI HYBRID STACK KPI MANAGEMENT (WINDOWS HOST)
echo ========================================================

echo [1/3] Memastikan Container Docker (PostgreSQL & Backup) Aktif...
docker compose up -d

echo [2/3] Memulai Aplikasi Next.js Native (Port 3000)...
set PORT=3000
set NODE_ENV=production
start "KPI-Nextjs-Native" /min node --env-file=.env.local .next_fresh/standalone/server.js

echo [3/3] Memulai Cloudflare Tunnel Native (kpi.noviana.app)...
start "KPI-Cloudflare-Tunnel" /min "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config cloudflared\config.yml run

echo.
echo ✓ Seluruh layanan berhasil dijalankan!
echo   - Web App Lokal: http://127.0.0.1:3000
echo   - Domain Publik: https://kpi.noviana.app
echo   - PostgreSQL: 127.0.0.1:5433 (Docker)
echo   - Auto-Backup: Docker Container (Daily)
echo ========================================================
