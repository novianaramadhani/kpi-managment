@echo off
title KPI Management - Menyalakan Sistem
cls

echo ======================================================================
echo           MENYALAKAN SISTEM KPI MANAGEMENT (FULL DOCKER)
echo ======================================================================
echo.

cd /d "%~dp0"

if not exist ".env" (
    if exist ".env.development" set "APP_ENV_FILE=.env.development"
)

echo [1/4] Memeriksa Docker Engine...
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 goto :DOCKER_OK

echo.
echo ======================================================================
echo PERINGATAN: DOCKER ENGINE ATAU DOCKER DESKTOP BELUM AKTIF!
echo ======================================================================
echo Mesin Docker di Windows Anda saat ini belum berjalan.
echo.
echo Langkah mudah untuk menyalakan:
echo 1. Buka Start Menu Windows, cari dan klik 'Docker Desktop'.
echo 2. Tunggu sekitar 15-30 detik sampai Docker Engine siap.
echo 3. Jalankan kembali file 'start-kpi.bat' ini.
echo ======================================================================
echo.
pause
exit /b

:DOCKER_OK
docker network inspect kpi-network >nul 2>&1 || docker network create kpi-network >nul 2>&1
echo       [OK] Docker Engine dan jaringan kpi-network siap.

echo.
echo [2/4] Menyalakan Database PostgreSQL dan Auto-Backup (docker-compose.db.yml)...
docker compose -f docker-compose.db.yml up -d
echo       Menunggu database siap menerima koneksi...
powershell -NoProfile -Command "for ($i=0; $i -lt 15; $i++) { $h = docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' kpi-postgres 2>$null; if ($h -eq 'healthy') { break }; Start-Sleep -Seconds 1 }"
echo       [OK] Container kpi-postgres dan kpi-backup aktif.

echo.
echo [3/4] Menyalakan Container Aplikasi Next.js (docker-compose.app.yml)...
docker compose -f docker-compose.app.yml up -d
echo       [OK] Container kpi-app aktif pada port 3001.

echo.
echo [4/4] Menyalakan Cloudflare Tunnel...
sc.exe start Cloudflared >nul 2>&1
tasklist /fi "imagename eq cloudflared.exe" 2>nul | find /i "cloudflared.exe" >nul
if "%ERRORLEVEL%"=="0" goto :TUNNEL_RUNNING

start "" /b "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --config "cloudflared\config.yml" run >nul 2>&1
echo       [OK] Cloudflare Tunnel berhasil dijalankan di background.
goto :CHECK_ACCESS

:TUNNEL_RUNNING
echo       [OK] Cloudflare Tunnel aktif di background.

:CHECK_ACCESS
echo.
echo ======================================================================
echo                VERIFIKASI KESEHATAN AKSES AKHIR
echo ======================================================================
powershell -NoProfile -Command "Start-Sleep -Seconds 2; try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 3; if ($res.ok) { Write-Host '  - Akses Lokal Port 3001  : [RUNNING] http://127.0.0.1:3001 (SEHAT)' -ForegroundColor Green } } catch { Write-Host '  - Akses Lokal Port 3001  : [MEMULAI] Sedang menyiapkan koneksi...' -ForegroundColor Yellow }"
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'https://kpi.noviana.app/api/health' -TimeoutSec 5; if ($res.ok) { Write-Host '  - Akses Domain Publik    : [RUNNING] https://kpi.noviana.app (SEHAT)' -ForegroundColor Green } } catch { Write-Host '  - Akses Domain Publik    : [MEMULAI] Sedang menghubungkan edge tunnel...' -ForegroundColor Yellow }"

echo ======================================================================
echo           SELURUH SISTEM KPI MANAGEMENT TELAH SIAP DIGUNAKAN!
echo ======================================================================
echo.
pause
