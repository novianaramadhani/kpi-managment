@echo off
title KPI Management - Menghentikan Sistem
cls

echo ======================================================================
echo           MENGHENTIKAN SISTEM KPI MANAGEMENT (FULL DOCKER)
echo ======================================================================
echo.
echo PERHATIAN:
echo Perintah ini akan menghentikan container Docker dan Cloudflare Tunnel
echo untuk menghemat baterai dan RAM laptop Anda.
echo Seluruh database, volume, dan data KPI tetap aman tersimpan di disk.
echo.

set /p CONFIRM="Apakah Anda yakin ingin menghentikan sistem sekarang? [Y/N]: "
if /i "%CONFIRM%"=="Y" goto :DO_STOP

echo.
echo Pembatalan: Sistem KPI tetap berjalan normal.
echo ======================================================================
pause
exit /b

:DO_STOP
echo.
cd /d "%~dp0"
if not exist ".env" (
    if exist ".env.development" set "APP_ENV_FILE=.env.development"
)

echo [1/3] Menghentikan Cloudflare Tunnel...
sc.exe stop Cloudflared >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
echo       [OK] Cloudflare Tunnel berhasil dihentikan.

echo.
echo [2/3] Menghentikan Container Aplikasi Next.js (kpi-app)...
docker compose -f docker-compose.app.yml stop
echo       [OK] Container kpi-app berhasil dihentikan.

echo.
echo [3/3] Menghentikan Container Database dan Backup (kpi-postgres & kpi-backup)...
docker compose -f docker-compose.db.yml stop
echo       [OK] Container kpi-postgres dan kpi-backup berhasil dihentikan.

echo.
echo ======================================================================
echo       SELURUH LAYANAN KPI MANAGEMENT TELAH BERHASIL DIHENTIKAN!
echo ======================================================================
echo  - Port 3001 dan port 5433 sekarang telah dilepaskan.
echo  - Data PostgreSQL dan file backup tetap aman tersimpan.
echo  - Untuk menyalakan kembali, jalankan file 'start-kpi.bat'.
echo ======================================================================
echo.
pause
