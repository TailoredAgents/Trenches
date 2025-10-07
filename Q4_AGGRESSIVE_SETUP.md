# Q4 Memecoin Mania - Aggressive Trading Setup

## 🚨 WARNING: HIGH-RISK HIGH-REWARD CONFIGURATION

This setup prioritizes **maximum gains during the Q4 bull run** over conservative risk management. Use at your own risk.

## Key Changes Made

### 🔓 Relaxed Safety Restrictions
- **RugGuard threshold**: 60% → 80% (fewer rejections)
- **Minimum liquidity**: 20 SOL → 8 SOL (earlier entry)
- **Pool age requirement**: 30s → 15s (faster entry)
- **Buy/sell ratio**: 2.2 → 1.5 (more volatile tokens)
- **Holder concentration**: 20% → 35% (allow whale involvement)

### 💪 Aggressive Position Sizing
- **Daily spend cap**: 0.3 SOL → 2.0 SOL (6x increase)
- **Per-token cap**: 30% → 50% of equity
- **Max per token**: 5 SOL → 15 SOL (3x increase)
- **Concurrent positions**: 3 → 8 (more opportunities)
- **Risk fractions**: 2x-3x increases across all tiers

### ⚡ Speed Optimizations
- **Fast-entry mode**: Bypasses safety checks for trending tokens
- **Increased retries**: 3 → 5 attempts
- **Higher rate limits**: 600 req/min (was 180-240)
- **Faster update intervals**: 3s price updates (was 7s)

### 🌙 Moonshot Exit Strategy
- **First exit**: 100% profit (was 50%) - exit only 15%
- **Second exit**: 300% profit (was 200%) - exit 20%
- **Third exit**: 800% profit (was 400%) - exit 25%
- **Final hold**: Keep 40% for 2000%+ moonshots
- **Wider trailing stops**: 40% (was 28%)

## Quick Start

### 1. One-Command Launch
```bash
./scripts/start-q4-aggressive.sh
```

### 2. Manual Environment Setup
```bash
export AGGRESSIVE_MODE=1
export DAILY_SPEND_CAP_SOL=2.0
export MAX_OPEN_POSITIONS=30
export FAST_MODE=1
export USE_JITO=1
```

### 3. Start Individual Services
```bash
# Core services with aggressive settings
pnpm run dev:core
```

## Configuration Files

- **`config/q4-aggressive.yaml`** - Complete aggressive configuration
- **`scripts/start-q4-aggressive.sh`** - One-click startup script

## Monitoring Your Aggressive Setup

### Dashboard
- **UI**: http://localhost:3000
- **Health**: http://localhost:4010/healthz
- **Metrics**: http://localhost:4010/metrics

### Key Metrics to Watch
```bash
# Position count (should be higher)
curl -s localhost:4010/metrics | grep open_positions

# Trade frequency (should be higher) 
curl -s localhost:4010/metrics | grep orders_submitted

# Success rate (monitor closely)
curl -s localhost:4010/metrics | grep landed_rate
```

## Risk Management

### ⚠️ What's Relaxed
- Smaller liquidity requirements (8 SOL vs 20 SOL)
- Higher rug tolerance (80% vs 60%)
- Faster entries (15s vs 30s pool age)
- Larger position sizes (2x normal sizing)

### ✅ What's Still Protected
- Authority checks still active
- Hard stop losses still enforced
- Daily loss caps increased but present
- Core RugGuard ML model still running

## Expected Behavior Changes

### Before (Conservative)
- 3-5 trades per day
- 0.05-0.1 SOL position sizes
- 50% profit first exits
- Strict safety rejections

### After (Aggressive)
- 15-30 trades per day
- 0.2-0.5 SOL position sizes  
- 100% profit first exits
- Fast-entry for trending tokens

## Optimal Settings by Account Size

### Small Account (< 10 SOL)
```bash
export DAILY_SPEND_CAP_SOL=1.0
export PER_NAME_CAP_FRACTION=0.3
export MAX_OPEN_POSITIONS=20
```

### Medium Account (10-50 SOL)
```bash
export DAILY_SPEND_CAP_SOL=2.0  # Default
export PER_NAME_CAP_FRACTION=0.5
export MAX_OPEN_POSITIONS=30
```

### Large Account (50+ SOL)
```bash
export DAILY_SPEND_CAP_SOL=5.0
export PER_NAME_CAP_FRACTION=0.6
export MAX_OPEN_POSITIONS=40
```

## Troubleshooting

### Too Conservative Still?
```bash
# Even more aggressive (use carefully)
export RUGGUARD_THRESHOLD=0.85
export LP_MIN_SOL=5
export MIN_POOL_AGE_SEC=10
```

### Too Aggressive?
```bash
# Dial back if needed
export RUGGUARD_THRESHOLD=0.7
export DAILY_SPEND_CAP_SOL=1.0
export MAX_OPEN_POSITIONS=20
```

### Performance Issues?
```bash
# Reduce load
export MAX_OPEN_POSITIONS=15
export LOG_LEVEL=error
export SILENT_MODE=1
```

## Emergency Controls

### Emergency Stop
```bash
pkill -f trenches  # Kill all services
```

### Flatten All Positions
```bash
curl -X POST http://localhost:4016/control/flatten \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Switch Back to Conservative
```bash
unset AGGRESSIVE_MODE
# Restart services
```

## Performance Expectations

### Conservative vs Aggressive

| Metric | Conservative | Aggressive | Multiplier |
|--------|-------------|------------|-----------|
| Daily trades | 3-5 | 15-30 | 5-6x |
| Position size | 0.05-0.1 SOL | 0.2-0.5 SOL | 4x |
| Opportunities | 12/day | 25/day | 2x |
| Speed to entry | 30s+ | 15s+ | 2x |
| Risk per trade | 12% | 25% | 2x |

### Estimated Returns (Bull Market)
- **Conservative**: 10-30% monthly
- **Aggressive**: 50-150% monthly (with higher risk)

## Final Notes

🎯 **Best for**: Q4 bull run, memecoin mania periods, high-conviction traders
⚠️ **Risk**: Higher drawdowns, faster losses if market turns
🎰 **Strategy**: Catch moonshots early, let winners run, size aggressively

Remember: This setup is designed for the 3-week memecoin mania window. Consider reverting to conservative settings during uncertain market conditions.