Param()

$ErrorActionPreference = 'Continue'

Write-Host "RPC probe and health summary:" -ForegroundColor Cyan
try { pnpm exec tsx tools/smoke/rpc-smoke.ts } catch { Write-Host $_ -ForegroundColor Red }
try { pnpm exec tsx tools/smoke/ports-smoke.ts } catch { Write-Host $_ -ForegroundColor Red }
try { pnpm exec tsx tools/smoke/healthz-smoke.ts } catch { Write-Host $_ -ForegroundColor Red }

Write-Host "Done." -ForegroundColor Green

