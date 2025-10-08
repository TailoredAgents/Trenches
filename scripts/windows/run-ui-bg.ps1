Param()

$ErrorActionPreference = 'SilentlyContinue'

$repoRoot = (Get-Location).Path
$logRoot = Join-Path $repoRoot 'tmp\logs'
if (!(Test-Path $logRoot)) { New-Item -ItemType Directory -Path $logRoot | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outLog = Join-Path $logRoot ("ui_" + $stamp + ".out.log")
$errLog = Join-Path $logRoot ("ui_" + $stamp + ".err.log")

# Launch Next.js UI dev server in background on port 3000
$env:NODE_OPTIONS = ''
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c pnpm -F @trenches/ui-gateway dev'
$psi.WorkingDirectory = $repoRoot
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$null = $proc.Start()

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

Write-Output ("UI STARTED PID=" + $proc.Id + " OUT_LOG=" + $outLog + " ERR_LOG=" + $errLog)

