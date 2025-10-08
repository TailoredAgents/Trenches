# Trenches Memecoin Hunter Startup Script - Windows PowerShell Version
# Optimized for aggressive memecoin trading and moonshot hunting

Write-Host "🚀 Starting Trenches Memecoin Hunter" -ForegroundColor Green
Write-Host "💰 Aggressive configuration: Fast entries, large positions, moonshot exits" -ForegroundColor Yellow
Write-Host "🎯 Optimized for maximum gains during bull market conditions" -ForegroundColor Yellow

# Set production environment
$env:NODE_ENV = "production"

# Increased resource limits for high-frequency trading
$env:NODE_OPTIONS = "--max-old-space-size=8192"

# Enhanced logging for monitoring trades
$env:LOG_LEVEL = "info"

Write-Host "Starting all services with aggressive memecoin hunting configuration..." -ForegroundColor Cyan

# Array to store process objects
$processes = @()

# Function to start a service
function Start-TrenchesService {
    param($ServiceName, $FilterName)
    Write-Host "Starting $ServiceName..." -ForegroundColor White
    $process = Start-Process -FilePath "npx" -ArgumentList "pnpm", "--filter", $FilterName, "start" -NoNewWindow -PassThru
    return $process
}

# Start all services
$processes += Start-TrenchesService "agent-core" "@trenches/agent-core"
$processes += Start-TrenchesService "social-ingestor" "@trenches/social-ingestor"
$processes += Start-TrenchesService "onchain-discovery" "@trenches/onchain-discovery"
$processes += Start-TrenchesService "safety-engine" "@trenches/safety-engine"
$processes += Start-TrenchesService "policy-engine" "@trenches/policy-engine"
$processes += Start-TrenchesService "executor" "@trenches/executor"
$processes += Start-TrenchesService "position-manager" "@trenches/position-manager"
$processes += Start-TrenchesService "narrative-miner" "@trenches/narrative-miner"
$processes += Start-TrenchesService "leader-wallets" "@trenches/leader-wallets"
$processes += Start-TrenchesService "price-updater" "@trenches/price-updater"

# Wait for services to initialize
Start-Sleep -Seconds 10

Write-Host ""
Write-Host "🎯 TRENCHES MEMECOIN HUNTER ACTIVE" -ForegroundColor Green
Write-Host "📊 Dashboard: http://localhost:3000" -ForegroundColor Yellow
Write-Host "⚡ Fast-entry mode: ALWAYS ENABLED" -ForegroundColor Yellow
Write-Host "💪 Position sizing: AGGRESSIVE DEFAULT" -ForegroundColor Yellow
Write-Host "🎰 Max concurrent positions: 8" -ForegroundColor Yellow
Write-Host "🚨 RugGuard threshold: 80% (relaxed)" -ForegroundColor Yellow
Write-Host ""
Write-Host "🌙 MOONSHOT STRATEGY:" -ForegroundColor Magenta
Write-Host "   - First exit: 100% profit (partial exit)" -ForegroundColor White
Write-Host "   - Second exit: 300% profit (partial exit)" -ForegroundColor White
Write-Host "   - Third exit: 800% profit (partial exit)" -ForegroundColor White
Write-Host "   - HODL target: 2000%+ gains" -ForegroundColor White
Write-Host ""
Write-Host "🎮 Quick Commands:" -ForegroundColor Cyan
Write-Host "   Monitor: curl http://localhost:4010/snapshot" -ForegroundColor White
Write-Host "   Health: curl http://localhost:4010/healthz" -ForegroundColor White
Write-Host "   Metrics: curl http://localhost:4010/metrics" -ForegroundColor White
Write-Host "   Emergency stop: Stop-Process -Name node" -ForegroundColor White
Write-Host ""

Write-Host "🚀 Trenches Memecoin Hunter is LIVE!" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow

# Setup cleanup function
function Stop-TrenchesServices {
    Write-Host "🛑 Shutting down Trenches Memecoin Hunter..." -ForegroundColor Red
    foreach ($process in $processes) {
        if ($process -and !$process.HasExited) {
            try {
                $process.Kill()
                Write-Host "Stopped process $($process.Id)" -ForegroundColor Gray
            }
            catch {
                Write-Host "Failed to stop process $($process.Id): $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    Write-Host "✅ All services stopped" -ForegroundColor Green
    exit 0
}

# Register event handler for Ctrl+C
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-TrenchesServices }

try {
    # Keep script running and monitor processes
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Check if any critical processes have died
        $aliveProcesess = $processes | Where-Object { $_ -and !$_.HasExited }
        if ($aliveProcesess.Count -lt ($processes.Count * 0.7)) {
            Write-Host "⚠️ Too many services have stopped. Restarting may be needed." -ForegroundColor Red
        }
    }
}
catch {
    Write-Host "Script interrupted: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Stop-TrenchesServices
}