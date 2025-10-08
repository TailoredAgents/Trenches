Param()

$ErrorActionPreference = 'SilentlyContinue'

# Ports used by the stack
$ports = @(3000) + (4010..4020) + @(8090)

Write-Host "Stopping listeners on ports: $($ports -join ', ')" -ForegroundColor Yellow

try {
  $conns = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
      try { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue; Write-Host "Killed PID $pid" } catch {}
    }
  } else {
    Write-Host "No listeners found" -ForegroundColor Green
  }
} catch {
  Write-Host "Warning: unable to enumerate listeners. You may need admin PowerShell." -ForegroundColor DarkYellow
}

Write-Host "Done." -ForegroundColor Green

