Param()

$ErrorActionPreference = 'SilentlyContinue'

$repoRoot = (Get-Location).Path
$dotenv = Join-Path $repoRoot '.env'
if (Test-Path $dotenv) {
  $env:DOTENV_CONFIG_PATH = $dotenv
}

# Live mode
$env:AGENT_MODE = 'FULL'
Remove-Item Env:NO_RPC -ErrorAction SilentlyContinue
Remove-Item Env:DISABLE_PROVIDERS -ErrorAction SilentlyContinue
Remove-Item Env:ENABLE_SHADOW_OUTCOMES -ErrorAction SilentlyContinue
Remove-Item Env:EXECUTOR_SHADOW_MODE -ErrorAction SilentlyContinue

# Small-wallet overrides unless the user explicitly set TRENCHES_CONFIG
if (-not $env:TRENCHES_CONFIG) {
  $smallCfg = Join-Path $repoRoot 'config\local.small-wallet.yaml'
  if (Test-Path $smallCfg) {
    $env:TRENCHES_CONFIG = $smallCfg
  }
}

# Prepare logs
$logRoot = Join-Path $repoRoot 'tmp\logs'
if (!(Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outLog = Join-Path $logRoot ("devcore_" + $stamp + ".out.log")
$errLog = Join-Path $logRoot ("devcore_" + $stamp + ".err.log")

# Spawn via cmd.exe to resolve pnpm shim reliably
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c pnpm run dev:core'
$psi.WorkingDirectory = $repoRoot
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()

# Async log tee
Start-Job -ScriptBlock {
  param($handle,$file)
  $sw = New-Object System.IO.StreamWriter($file, $true)
  try {
    while (-not $handle.HasExited) {
      $line = $handle.StandardOutput.ReadLine()
      if ($line -ne $null) { $sw.WriteLine($line) }
    }
  } catch {}
  $sw.Flush(); $sw.Close()
} -ArgumentList $proc,$outLog | Out-Null

Start-Job -ScriptBlock {
  param($handle,$file)
  $sw = New-Object System.IO.StreamWriter($file, $true)
  try {
    while (-not $handle.HasExited) {
      $line = $handle.StandardError.ReadLine()
      if ($line -ne $null) { $sw.WriteLine($line) }
    }
  } catch {}
  $sw.Flush(); $sw.Close()
} -ArgumentList $proc,$errLog | Out-Null

Write-Output ("STARTED PID=" + $proc.Id + " OUT_LOG=" + $outLog + " ERR_LOG=" + $errLog)

