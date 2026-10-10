$ErrorActionPreference = "Stop"

$DemoPort = 5174
$LocalUrl = "http://127.0.0.1:$DemoPort"
$Tailscale = Get-Command tailscale.exe -ErrorAction SilentlyContinue

if (-not $Tailscale) {
  throw "Tailscale CLI was not found. Install Tailscale and connect this device to the tailnet first."
}

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $LocalUrl -TimeoutSec 5
  if ($response.StatusCode -ne 200) { throw "Unexpected HTTP status $($response.StatusCode)" }
} catch {
  throw "Aladdin is not responding at $LocalUrl. In another terminal run: npm run demo"
}

function Invoke-Tailscale([string]$Arguments, [string]$Label) {
  $stdout = Join-Path $env:TEMP "aladdin-tailscale-$Label-out.txt"
  $stderr = Join-Path $env:TEMP "aladdin-tailscale-$Label-err.txt"
  $process = Start-Process -FilePath $Tailscale.Source -ArgumentList $Arguments -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $output = @()
  if (Test-Path $stdout) { $output += Get-Content $stdout }
  if (Test-Path $stderr) { $output += Get-Content $stderr }
  if ($process.ExitCode -ne 0) { throw ($output -join [Environment]::NewLine) }
  return $output
}

Write-Host "Configuring private Tailscale Serve for $LocalUrl ..." -ForegroundColor Cyan
Invoke-Tailscale "serve --bg $DemoPort" "serve" | ForEach-Object { Write-Host $_ }
Write-Host "Current private Serve configuration:" -ForegroundColor Green
Invoke-Tailscale "serve status" "status" | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Only authorised tailnet devices can open the HTTPS URL above."
Write-Host "The Aladdin frontend process must remain running."
Write-Host "Stop private serving with: tailscale serve reset"
