#!/bin/bash

# Trenches Memecoin Hunter Startup Script
# Optimized for aggressive memecoin trading and moonshot hunting

echo "🚀 Starting Trenches Memecoin Hunter"
echo "💰 Aggressive configuration: Fast entries, large positions, moonshot exits"
echo "🎯 Optimized for maximum gains during bull market conditions"

# Set production environment
export NODE_ENV=production

# Increased resource limits for high-frequency trading
export NODE_OPTIONS="--max-old-space-size=8192"

# Enhanced logging for monitoring trades
export LOG_LEVEL=info

echo "Starting all services with aggressive memecoin hunting configuration..."

# Start all services in aggressive mode
echo "Starting agent-core..."
npx pnpm --filter @trenches/agent-core start &
AGENT_PID=$!

echo "Starting social-ingestor with amplified signals..."
npx pnpm --filter @trenches/social-ingestor start &
SOCIAL_PID=$!

echo "Starting onchain-discovery with relaxed filters..."
npx pnpm --filter @trenches/onchain-discovery start &
DISCOVERY_PID=$!

echo "Starting safety-engine in fast-entry mode..."
npx pnpm --filter @trenches/safety-engine start &
SAFETY_PID=$!

echo "Starting policy-engine with aggressive sizing..."
npx pnpm --filter @trenches/policy-engine start &
POLICY_PID=$!

echo "Starting executor with maximum retries..."
npx pnpm --filter @trenches/executor start &
EXECUTOR_PID=$!

echo "Starting position-manager with moonshot exits..."
npx pnpm --filter @trenches/position-manager start &
POSITION_PID=$!

echo "Starting narrative-miner with trend amplification..."
npx pnpm --filter @trenches/narrative-miner start &
NARRATIVE_PID=$!

# Optional services for full alpha detection
echo "Starting leader-wallets for smart money signals..."
npx pnpm --filter @trenches/leader-wallets start &
LEADER_PID=$!

echo "Starting price-updater with high frequency..."
npx pnpm --filter @trenches/price-updater start &
PRICE_PID=$!

# Wait a moment for services to initialize
sleep 10

echo ""
echo "🎯 TRENCHES MEMECOIN HUNTER ACTIVE"
echo "📊 Dashboard: http://localhost:3000"
echo "⚡ Fast-entry mode: ALWAYS ENABLED"
echo "💪 Position sizing: AGGRESSIVE DEFAULT"
echo "🎰 Max concurrent positions: 8"
echo "🚨 RugGuard threshold: 80% (relaxed)"
echo ""
echo "🌙 MOONSHOT STRATEGY:"
echo "   - First exit: 100% profit (partial exit)"
echo "   - Second exit: 300% profit (partial exit)"  
echo "   - Third exit: 800% profit (partial exit)"
echo "   - HODL target: 2000%+ gains"
echo ""
echo "🎮 Quick Commands:"
echo "   Monitor: curl http://localhost:4010/snapshot"
echo "   Health: curl http://localhost:4010/healthz"
echo "   Metrics: curl http://localhost:4010/metrics"
echo "   Emergency stop: pkill -f trenches"
echo ""

# Setup cleanup trap
cleanup() {
    echo "🛑 Shutting down Trenches Memecoin Hunter..."
    kill $AGENT_PID $SOCIAL_PID $DISCOVERY_PID $SAFETY_PID $POLICY_PID $EXECUTOR_PID $POSITION_PID $NARRATIVE_PID $LEADER_PID $PRICE_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "🚀 Trenches Memecoin Hunter is LIVE!"
echo "Press Ctrl+C to stop all services"

# Keep script running
wait