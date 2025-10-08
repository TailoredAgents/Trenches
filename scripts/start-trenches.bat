@echo off
:: Trenches Memecoin Hunter Startup Script - Windows Batch Version
:: Optimized for aggressive memecoin trading and moonshot hunting

echo 🚀 Starting Trenches Memecoin Hunter
echo 💰 Aggressive configuration: Fast entries, large positions, moonshot exits
echo 🎯 Optimized for maximum gains during bull market conditions

:: Set production environment
set NODE_ENV=production
set NODE_OPTIONS=--max-old-space-size=8192
set LOG_LEVEL=info

echo Starting all services with aggressive memecoin hunting configuration...

:: Start all services in background
echo Starting agent-core...
start "agent-core" /min npx pnpm --filter @trenches/agent-core start

echo Starting social-ingestor...
start "social-ingestor" /min npx pnpm --filter @trenches/social-ingestor start

echo Starting onchain-discovery...
start "onchain-discovery" /min npx pnpm --filter @trenches/onchain-discovery start

echo Starting safety-engine...
start "safety-engine" /min npx pnpm --filter @trenches/safety-engine start

echo Starting policy-engine...
start "policy-engine" /min npx pnpm --filter @trenches/policy-engine start

echo Starting executor...
start "executor" /min npx pnpm --filter @trenches/executor start

echo Starting position-manager...
start "position-manager" /min npx pnpm --filter @trenches/position-manager start

echo Starting narrative-miner...
start "narrative-miner" /min npx pnpm --filter @trenches/narrative-miner start

echo Starting leader-wallets...
start "leader-wallets" /min npx pnpm --filter @trenches/leader-wallets start

echo Starting price-updater...
start "price-updater" /min npx pnpm --filter @trenches/price-updater start

:: Wait for services to initialize
timeout /t 10 /nobreak

echo.
echo 🎯 TRENCHES MEMECOIN HUNTER ACTIVE
echo 📊 Dashboard: http://localhost:3000
echo ⚡ Fast-entry mode: ALWAYS ENABLED
echo 💪 Position sizing: AGGRESSIVE DEFAULT
echo 🎰 Max concurrent positions: 8
echo 🚨 RugGuard threshold: 80%% (relaxed)
echo.
echo 🌙 MOONSHOT STRATEGY:
echo    - First exit: 100%% profit (partial exit)
echo    - Second exit: 300%% profit (partial exit)
echo    - Third exit: 800%% profit (partial exit)
echo    - HODL target: 2000%%+ gains
echo.
echo 🎮 Quick Commands:
echo    Monitor: curl http://localhost:4010/snapshot
echo    Health: curl http://localhost:4010/healthz
echo    Metrics: curl http://localhost:4010/metrics
echo    Emergency stop: taskkill /f /im node.exe
echo.

echo 🚀 Trenches Memecoin Hunter is LIVE!
echo Press Ctrl+C to stop (will leave services running)
echo To stop all services: taskkill /f /im node.exe

pause