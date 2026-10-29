@echo off
setlocal
echo ========================================================
echo  MENGHENTIKAN LAYANAN NATIVE KPI MANAGEMENT
echo ========================================================

echo Menghentikan Cloudflare Tunnel native...
taskkill /f /im cloudflared.exe > nul 2>&1

echo Menghentikan proses Next.js di Port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a > nul 2>&1
)

echo.
echo ✓ Layanan native (App & Tunnel) telah dihentikan.
echo (Catatan: Database PostgreSQL dan Backup di Docker tetap berjalan normal).
echo ========================================================
