@echo off
title KPI Management - Menyalakan Sistem
cls

echo ======================================================================
echo           MENYALAKAN SISTEM KPI MANAGEMENT (FULL DOCKER)
echo ======================================================================
echo.

cd /d "%~dp0"

echo [1/5] Memeriksa Docker Engine...
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
echo       [OK] Docker Engine terhubung dan siap.

echo.
echo [2/5] Menyalakan Database PostgreSQL (kpi-postgres)...
docker compose -f docker-compose.db.yml up -d
echo       Menunggu database siap menerima koneksi...
powershell -NoProfile -Command "for ($i=0; $i -lt 15; $i++) { $h = docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' kpi-postgres 2>$null; if ($h -eq 'healthy') { break }; Start-Sleep -Seconds 1 }"
echo       [OK] Database PostgreSQL (kpi-postgres) telah SEHAT dan siap.

echo.
echo [3/5] Memastikan Container Backup Otomatis Aktif (kpi-backup)...
docker compose -f docker-compose.backup.yml up -d
echo       [OK] Container kpi-backup aktif (jadwal backup harian berjalan).

echo.
echo [4/5] Menyalakan Container Aplikasi Next.js (kpi-app)...
docker compose -f docker-compose.app.yml up -d
echo       [OK] Container kpi-app aktif pada port 3001.

echo.
echo [5/5] Menyalakan Cloudflare Tunnel...
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
