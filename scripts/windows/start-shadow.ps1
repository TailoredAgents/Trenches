Param()

$ErrorActionPreference = 'Continue'

$repoRoot = (Get-Location).Path
$dotenv = Join-Path $repoRoot '.env'
if (Test-Path $dotenv) {
  $env:DOTENV_CONFIG_PATH = $dotenv
}

$env:AGENT_MODE = 'SHADOW'
$env:NO_RPC = '1'
$env:DISABLE_PROVIDERS = '1'
$env:ENABLE_SHADOW_OUTCOMES = '1'
$env:EXECUTOR_SHADOW_MODE = '1'
if (-not $env:SOLANA_PRIMARY_RPC_URL) { $env:SOLANA_PRIMARY_RPC_URL = 'http://127.0.0.1:8899' }

Write-Host "Starting Trenches stack in SHADOW mode (no RPC/providers) ..." -ForegroundColor Cyan
Write-Host "DOTENV_CONFIG_PATH=$($env:DOTENV_CONFIG_PATH)" -ForegroundColor DarkCyan

pnpm run dev:core

