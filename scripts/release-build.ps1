# MCEManager Windows release packaging script.
#
# Builds daemon + panel + frontend and packages the result into the same
# layout used for the Windows zip releases:
#
#   mce_manager_windows_release.zip -> mcemanager/{daemon,web,start.bat}

$ErrorActionPreference = "Stop"
$BasePath = Get-Location
$ReleaseName = "mcemanager"
$ZipName = "mce_manager_windows_release.zip"

if (-not (Test-Path "$BasePath\production-code")) {
    Write-Host "production-code not found. Running the full build first..."
    & "$BasePath\install-dependents.bat"
    & "$BasePath\build.bat"
}

Write-Host "Staging release files..."
$staging = Join-Path $BasePath "staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
if (Test-Path (Join-Path $BasePath $ZipName)) { Remove-Item -Force (Join-Path $BasePath $ZipName) }
$releaseDir = Join-Path $staging $ReleaseName
New-Item -ItemType Directory -Force -Path "$releaseDir\daemon" | Out-Null
New-Item -ItemType Directory -Force -Path "$releaseDir\web" | Out-Null

Copy-Item -Recurse -Force "$BasePath\production-code\daemon\*" "$releaseDir\daemon\"
Copy-Item -Recurse -Force "$BasePath\production-code\web\*" "$releaseDir\web\"

Copy-Item -Force "$BasePath\prod-scripts\windows\start.bat" $releaseDir
Copy-Item -Force "$BasePath\LICENSE" $releaseDir

Write-Host "Creating $ZipName ..."
Compress-Archive -Path "$releaseDir" -DestinationPath (Join-Path $BasePath $ZipName) -CompressionLevel Optimal
Remove-Item -Recurse -Force $staging

Write-Host "--------------------------------------------"
Write-Host "Release ready: $BasePath\$ZipName"
Write-Host "--------------------------------------------"
