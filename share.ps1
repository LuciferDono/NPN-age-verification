# Expose the console on a temporary public URL for a live demo.
#
#   .\share.ps1
#
# Starts the API with the real model and public-mode guards, then opens a Cloudflare
# quick tunnel and prints the URL. Ctrl-C stops both.
#
# The tunnel is deliberately ephemeral: the URL dies with this process, there is no
# account, no DNS record, and nothing to forget to tear down. That is the right shape
# for a demo, and the wrong shape for anything permanent.
#
# NPN_PUBLIC=1 turns on a per-IP rate limit on /api/predict and a banner in the UI
# telling visitors not to upload images of other people. This is a biometric service;
# it should not look like an anonymous free tool.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$cloudflared = "cloudflared"

Write-Host ""
Write-Host "  Age Verification - public demo" -ForegroundColor White
Write-Host "  ------------------------------" -ForegroundColor DarkGray

if (-not (Test-Path (Join-Path $root "web\dist\index.html"))) {
    Write-Host "  web/dist is missing. Run: cd web; npm run build" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $root "checkpoints\dist\model.pt"))) {
    Write-Host "  No model at checkpoints/dist/model.pt - would serve mock data." -ForegroundColor Red
    exit 1
}

$env:NPN_MOCK = "0"
$env:NPN_PUBLIC = "1"
if (-not $env:NPN_RATE_LIMIT) { $env:NPN_RATE_LIMIT = "12" }

Write-Host "  model      real (checkpoints/dist)"
Write-Host "  rate limit $($env:NPN_RATE_LIMIT) predictions/min per IP"
Write-Host ""

$api = Start-Process -FilePath $python `
    -ArgumentList "-m", "uvicorn", "server.main:app", "--port", "8000", "--log-level", "warning" `
    -WorkingDirectory $root -PassThru -NoNewWindow

# Wait for the model to load before exposing anything: torch import plus first CUDA
# init takes a few seconds, and a tunnel pointed at a dead port just 502s.
$ready = $false
foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 750
    try {
        $h = Invoke-RestMethod "http://127.0.0.1:8000/api/health" -TimeoutSec 2
        if ($h.ok) { $ready = $true; break }
    } catch { }
}
if (-not $ready) {
    Write-Host "  API did not come up on :8000" -ForegroundColor Red
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "  api        http://127.0.0.1:8000  (ready)" -ForegroundColor Green
Write-Host ""
Write-Host "  Opening tunnel. The public URL appears below - share that one." -ForegroundColor DarkGray
Write-Host "  Ctrl-C here closes the tunnel and stops the API." -ForegroundColor DarkGray
Write-Host ""

try {
    & $cloudflared tunnel --url http://127.0.0.1:8000 --no-autoupdate
} finally {
    Write-Host ""
    Write-Host "  Tunnel closed. Stopping API." -ForegroundColor DarkGray
    Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
}
