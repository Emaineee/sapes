$ErrorActionPreference = 'Continue'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfDir = "$env:LOCALAPPDATA\cloudflared"
$cfExe = "$cfDir\cloudflared.exe"
$log = "$cfDir\tunnel.log"

Write-Host ""
Write-Host "=== SAPES Site Launcher ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] Node.js is not installed. Install it from https://nodejs.org then run this again." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path "$dir\server.js")) {
  Write-Host "[ERROR] server.js not found. Run this script from the project folder." -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

if (-not (Test-Path $cfExe)) {
  Write-Host "[1/3] Downloading Cloudflare tunnel client..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $cfDir | Out-Null
  Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
}

Write-Host "[2/3] Restarting site server..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Start-Process node -ArgumentList "server.js" -WorkingDirectory $dir -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Host "[3/3] Starting public tunnel..." -ForegroundColor Yellow
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process $cfExe -ArgumentList "tunnel --url http://localhost:3000 --no-autoupdate --logfile $log --loglevel info" -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1
  $m = Select-String -Path $log -Pattern "https://[\w-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue
  if ($m) { $url = $m.Matches.Value; break }
}

Write-Host ""
if ($url) {
  Write-Host "SAPES site is LIVE!" -ForegroundColor Green
  Write-Host "Share this link: $url" -ForegroundColor Cyan
  Write-Host "Local address : http://localhost:3000"
  Start-Process $url
} else {
  Write-Host "[ERROR] Tunnel did not start. Check the log: $log" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press 1 + Enter to SHUT DOWN the site, or close this window to keep it running."
$ans = Read-Host
if ($ans -eq '1') {
  Get-Process cloudflared, node -ErrorAction SilentlyContinue | Stop-Process -Force
  Write-Host "Site stopped. Goodbye!"
}
