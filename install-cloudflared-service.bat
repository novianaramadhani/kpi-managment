@echo off
chcp 65001 >nul
title Instalasi Windows Service Cloudflare Tunnel

:: Periksa hak Administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :INSTALL
) else (
    goto :ELEVATE
)

:ELEVATE
echo Meminta izin Administrator (UAC)...
powershell -NoProfile -Command "Start-Process cmd.exe -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
exit /b

:INSTALL
cls
echo =======================================================
echo     INSTALASI RESMI WINDOWS SERVICE CLOUDFLARE TUNNEL
echo =======================================================
echo.

:: Hentikan instance CLI yang mungkin sedang berjalan di latar belakang
echo 1. Menghentikan instance CLI cloudflared yang aktif...
taskkill /f /im cloudflared.exe >nul 2>&1

:: Salin konfigurasi terbaru ke direktori profil sistem jika diperlukan
echo 2. Memeriksa direktori konfigurasi systemprofile...
if not exist "C:\Windows\System32\config\systemprofile\.cloudflared" (
    mkdir "C:\Windows\System32\config\systemprofile\.cloudflared" >nul 2>&1
)
copy /y "%~dp0cloudflared\*.*" "C:\Windows\System32\config\systemprofile\.cloudflared\" >nul 2>&1
copy /y "%USERPROFILE%\.cloudflared\*.*" "C:\Windows\System32\config\systemprofile\.cloudflared\" >nul 2>&1

:: Install service
echo 3. Memasang Windows Service resmi...
"C:\Program Files (x86)\cloudflared\cloudflared.exe" service install

:: Atur startup otomatis dan jalankan
echo 4. Mengatur Startup Type menjadi Otomatis dan Menjalankan Service...
sc.exe config Cloudflared start= auto >nul 2>&1
sc.exe start Cloudflared >nul 2>&1

echo.
echo =======================================================
echo    WINDOWS SERVICE CLOUDFLARE TELAH BERHASIL DIPASANG!
echo =======================================================
echo  - Service Name: Cloudflared
echo  - Status      : Otomatis aktif saat laptop dinyalakan
echo  - Target      : http://127.0.0.1:3001
echo  - Domain      : https://kpi.noviana.app
echo =======================================================
echo.
pause

