#!/bin/bash

# Q4 Memecoin Mania Startup Script
# Configures Trenches for aggressive memecoin trading during bull run

echo "🚀 Starting Trenches in Q4 AGGRESSIVE MODE for Memecoin Season"
echo "⚠️  WARNING: This configuration prioritizes SPEED and GAINS over safety"
echo "💰 Increased position sizes, relaxed safety checks, faster execution"

# Set Q4 aggressive environment variables
export AGGRESSIVE_MODE=1
export NODE_ENV=production

# Increased resource limits
export NODE_OPTIONS="--max-old-space-size=8192"

# Relaxed safety thresholds
export RUGGUARD_THRESHOLD=0.8
export LP_MIN_SOL=8
export MIN_POOL_AGE_SEC=15

# Aggressive position sizing
export DAILY_SPEND_CAP_SOL=2.0
export MAX_OPEN_POSITIONS=30
export CONCURRENCY_CAP=8
export PER_NAME_CAP_FRACTION=0.5

# Speed optimizations
export FAST_MODE=1
export QUICK_ENTRY=1
export MAX_RETRIES=5
export PRIORITY_FEE=high
export USE_JITO=1

# Enhanced logging for monitoring aggressive trades
export LOG_LEVEL=info
export DEBUG_AGGRESSIVE=1

# Q4 specific memecoin detection
export MEME_SEASON_MODE=1
export SOCIAL_SIGNAL_MULTIPLIER=1.5
export MOMENTUM_BOOST=2.0

echo "Environment configured for Q4 aggressive trading"
echo "Starting services with memecoin season optimizations..."

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
echo "🎯 Q4 AGGRESSIVE MODE ACTIVE"
echo "📊 Dashboard: http://localhost:3000"
echo "⚡ Fast-entry mode: ENABLED"
echo "💪 Position sizing: 2x AGGRESSIVE"
echo "🎰 Max concurrent positions: 30"
echo "🚨 RugGuard threshold: 80% (relaxed)"
echo ""
echo "🌙 MOONSHOT CONFIGURATION:"
echo "   - First exit: 100% profit (15% position)"
echo "   - Second exit: 300% profit (20% position)"  
echo "   - Third exit: 800% profit (25% position)"
echo "   - HODL for 2000%: 40% position"
echo ""
echo "🎮 Quick Commands:"
echo "   Monitor: curl http://localhost:4010/snapshot"
echo "   Health: curl http://localhost:4010/healthz"
echo "   Metrics: curl http://localhost:4010/metrics"
echo "   Emergency stop: pkill -f trenches"
echo ""

# Setup cleanup trap
cleanup() {
    echo "🛑 Shutting down Q4 aggressive mode..."
    kill $AGENT_PID $SOCIAL_PID $DISCOVERY_PID $SAFETY_PID $POLICY_PID $EXECUTOR_PID $POSITION_PID $NARRATIVE_PID $LEADER_PID $PRICE_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "🚀 Q4 Memecoin Mania mode is LIVE!"
echo "Press Ctrl+C to stop all services"

# Keep script running
wait