Param()

$ErrorActionPreference = 'Continue'

$repoRoot = (Get-Location).Path
$dotenv = Join-Path $repoRoot '.env'
if (Test-Path $dotenv) {
  $env:DOTENV_CONFIG_PATH = $dotenv
}

# Ensure FULL mode and live providers
$env:AGENT_MODE = 'FULL'
Remove-Item Env:NO_RPC -ErrorAction SilentlyContinue
Remove-Item Env:DISABLE_PROVIDERS -ErrorAction SilentlyContinue
Remove-Item Env:ENABLE_SHADOW_OUTCOMES -ErrorAction SilentlyContinue
Remove-Item Env:EXECUTOR_SHADOW_MODE -ErrorAction SilentlyContinue

if (-not $env:TRENCHES_CONFIG) {
  $smallCfg = Join-Path $repoRoot 'config\local.small-wallet.yaml'
  if (Test-Path $smallCfg) {
    Write-Host "Using small-wallet overrides: $smallCfg (set TRENCHES_CONFIG to override)" -ForegroundColor DarkCyan
    $env:TRENCHES_CONFIG = $smallCfg
  }
}

Write-Host "Starting Trenches stack in FULL mode..." -ForegroundColor Cyan
Write-Host "DOTENV_CONFIG_PATH=$($env:DOTENV_CONFIG_PATH)" -ForegroundColor DarkCyan
if ($env:TRENCHES_CONFIG) { Write-Host "TRENCHES_CONFIG=$($env:TRENCHES_CONFIG)" -ForegroundColor DarkCyan }

# This will keep the console attached for logs
pnpm run dev:core
