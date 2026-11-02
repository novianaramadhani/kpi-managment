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

echo [1/4] Menghentikan Cloudflare Tunnel...
sc.exe stop Cloudflared >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
echo       [OK] Cloudflare Tunnel berhasil dihentikan.

echo.
echo [2/4] Menghentikan Container Aplikasi Next.js (kpi-app)...
docker compose -f docker-compose.app.yml stop
echo       [OK] Container kpi-app berhasil dihentikan secara aman.

echo.
echo [3/4] Menghentikan Container Backup Otomatis (kpi-backup)...
docker compose -f docker-compose.backup.yml stop
echo       [OK] Container kpi-backup berhasil dihentikan secara aman.

echo.
echo [4/4] Menghentikan Container Database PostgreSQL (kpi-postgres)...
docker compose -f docker-compose.db.yml stop
echo       [OK] Container kpi-postgres berhasil dihentikan secara aman.

echo.
echo ======================================================================
echo               SISTEM BERHASIL DIHENTIKAN SEMENTARA!
echo ======================================================================
echo  - Port 3001 dan port 5433 sekarang telah dilepaskan.
echo  - RAM dan baterai laptop Anda sekarang lebih hemat.
echo  - Seluruh data 1.707 karyawan aman di volume persistent.
echo  - Untuk menyalakan kembali, cukup jalankan 'start-kpi.bat'.
echo ======================================================================
echo.
pause
