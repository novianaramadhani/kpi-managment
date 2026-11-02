$wscript = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$projDir = "C:\Users\Noviana Ramadhani\Documents\template"

if (Test-Path $desktop) {
    # 1. Start Shortcut
    $s1 = $wscript.CreateShortcut((Join-Path $desktop "KPI - Start System.lnk"))
    $s1.TargetPath = (Join-Path $projDir "start-kpi.bat")
    $s1.WorkingDirectory = $projDir
    $s1.Description = "Menyalakan Sistem KPI Management (Full Docker)"
    $s1.Save()

    # 2. Stop Shortcut
    $s2 = $wscript.CreateShortcut((Join-Path $desktop "KPI - Stop System.lnk"))
    $s2.TargetPath = (Join-Path $projDir "stop-kpi.bat")
    $s2.WorkingDirectory = $projDir
    $s2.Description = "Menghentikan Sementara Sistem KPI Management"
    $s2.Save()

    # 3. Status Shortcut
    $s3 = $wscript.CreateShortcut((Join-Path $desktop "KPI - Status System.lnk"))
    $s3.TargetPath = (Join-Path $projDir "status-kpi.bat")
    $s3.WorkingDirectory = $projDir
    $s3.Description = "Memeriksa Status Sistem KPI Management"
    $s3.Save()

    Write-Host "Tiga shortcut desktop berhasil dibuat di: $desktop"
} else {
    Write-Host "Desktop folder tidak dapat diakses."
}

