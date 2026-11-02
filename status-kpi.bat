@echo off
setlocal enabledelayedexpansion
title KPI Management - Status Pemeriksaan Sistem
cls

echo ======================================================================
echo                STATUS SISTEM KPI MANAGEMENT (FULL DOCKER)
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Periksa Docker Engine
echo [1] DOCKER ENGINE DAN DOCKER DESKTOP:
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo     Status : [RUNNING] Docker Engine aktif dan terhubung.
) else (
    echo     Status : [STOPPED / ERROR] Docker Engine tidak aktif atau Docker Desktop belum dibuka.
    echo.
    echo ======================================================================
    echo Catatan: Buka aplikasi 'Docker Desktop' dari menu Windows untuk melanjutkan.
    echo ======================================================================
    pause
    exit /b
)

echo.
:: 2. Periksa Status Ketiga Container
echo [2] STATUS CONTAINER DOCKER:
for %%c in (kpi-postgres kpi-backup kpi-app) do (
    docker inspect -f "{{.State.Status}}" %%c >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        for /f "tokens=*" %%s in ('docker inspect -f "{{.State.Status}}" %%c') do set C_STATUS=%%s
        for /f "tokens=*" %%h in ('docker inspect -f "{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}" %%c') do set C_HEALTH=%%h
        if "!C_STATUS!"=="running" (
            if "!C_HEALTH!"=="healthy" (
                echo     - %%c : [RUNNING] Sehat ^(healthy^)
            ) else if "!C_HEALTH!"=="no-healthcheck" (
                echo     - %%c : [RUNNING] Berjalan
            ) else (
                echo     - %%c : [RUNNING] Memulai ^(!C_HEALTH!^)
            )
        ) else (
            echo     - %%c : [STOPPED] Container mati ^(!C_STATUS!^)
        )
    ) else (
        echo     - %%c : [ERROR] Container tidak ditemukan.
    )
)

echo.
:: 3. Periksa Windows Service Cloudflare Tunnel
echo [3] CLOUDFLARE TUNNEL (WINDOWS SERVICE / BACKGROUND):
set TUNNEL_FOUND=0

:: Cek Windows Service resmi
sc.exe query Cloudflared 2>nul | find /i "STATE" | find /i "RUNNING" >nul
if %ERRORLEVEL% equ 0 (
    echo     Status : [RUNNING] Windows Service 'Cloudflared' aktif.
    set TUNNEL_FOUND=1
) else (
    sc.exe query Cloudflared 2>nul | find /i "STATE" | find /i "STOPPED" >nul
    if !ERRORLEVEL! equ 0 (
        echo     Status : [STOPPED] Windows Service 'Cloudflared' terpasang namun sedang dihentikan.
        set TUNNEL_FOUND=2
    )
)

:: Jika service belum jalan, cek apakah berjalan via proses CLI background
if !TUNNEL_FOUND! equ 0 (
    tasklist /fi "imagename eq cloudflared.exe" 2>nul | find /i "cloudflared.exe" >nul
    if !ERRORLEVEL! equ 0 (
        echo     Status : [RUNNING] Proses background cloudflared.exe aktif.
        set TUNNEL_FOUND=1
    ) else (
        echo     Status : [STOPPED] Cloudflare Tunnel tidak aktif.
    )
)

echo.
:: 4. Periksa Endpoint Lokal (Port 3001)
echo [4] AKSES APLIKASI LOKAL (PORT 3001):
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health' -TimeoutSec 3; if ($res.ok) { Write-Host '     Status : [RUNNING] http://127.0.0.1:3001 (HTTP 200 OK)' -ForegroundColor Green } else { Write-Host '     Status : [ERROR] Respons tidak sesuai' -ForegroundColor Red } } catch { Write-Host '     Status : [STOPPED / ERROR] Tidak dapat dihubungi' -ForegroundColor Red }"

echo.
:: 5. Periksa Akses Domain Publik
echo [5] AKSES DOMAIN PUBLIK (HTTPS://KPI.NOVIANA.APP):
powershell -NoProfile -Command "try { $res = Invoke-RestMethod -Uri 'https://kpi.noviana.app/api/health' -TimeoutSec 5; if ($res.ok) { Write-Host '     Status : [RUNNING] https://kpi.noviana.app (HTTP 200 OK)' -ForegroundColor Green } else { Write-Host '     Status : [ERROR] Respons domain tidak sesuai' -ForegroundColor Red } } catch { Write-Host '     Status : [STOPPED / ERROR] Domain publik tidak dapat diakses' -ForegroundColor Red }"

echo.
echo ======================================================================
pause
