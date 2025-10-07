# Trenches Memecoin Hunter

**Aggressive Solana memecoin trading bot optimized for maximum gains**

## What It Does

Trenches is an AI-powered trading system that hunts memecoins on Solana with:
- **Fast-entry mode**: Instant entry on trending tokens
- **Aggressive position sizing**: 2x sizing for high-confidence trades  
- **Moonshot strategy**: Hold portions for 2000%+ gains
- **Smart risk management**: 80% RugGuard threshold, wider stops

## Quick Start

### 1. Install Dependencies
```bash
npx pnpm install
```

### 2. Configure Environment
Copy `env.example` to `.env` and configure:
- Wallet keystore path
- RPC endpoints  
- API keys (optional for full features)

### 3. Start Trading
```bash
# One-command startup
./scripts/start-trenches.sh

# Or manually
pnpm run dev:core
```

### 4. Monitor
- **Dashboard**: http://localhost:3000
- **Health**: `curl localhost:4010/healthz`
- **Metrics**: `curl localhost:4010/metrics`

## Key Features

### Aggressive Configuration (Built-in)
- **Daily spend**: 2.0 SOL (vs conservative 0.3 SOL)
- **Position sizing**: 25% risk fractions (vs conservative 12%)
- **Concurrent trades**: 8 positions (vs conservative 3)
- **Fast entry**: 15s pool age (vs conservative 30s)
- **RugGuard**: 80% threshold (vs conservative 60%)

### Moonshot Exit Strategy
1. **100% profit**: Partial exit (let winners run)
2. **300% profit**: Partial exit 
3. **800% profit**: Partial exit
4. **2000%+ profit**: Final target

### Fast-Entry Mode
Automatically bypasses safety checks for:
- High social sentiment (SSS > 5.0)
- High momentum tokens (velocity > 2.0)

## Trading Strategy

### Entry Criteria
- Minimum 8 SOL liquidity (aggressive)
- 6+ unique traders (fast entry)
- 1.5+ buy/sell ratio (volatile tolerance)
- Social sentiment or momentum signals

### Position Sizing  
- **High confidence**: 2x normal sizing
- **Trending tokens**: Aggressive multipliers
- **Risk fractions**: 10-25% based on account size

### Exit Management
- **Trailing stops**: 40% (wide for moonshots)
- **Hard stops**: 35% (generous)
- **Ladder exits**: Keep runners for massive gains

## Account Size Recommendations

### Small (< 10 SOL)
- Focus on 0.1-0.3 SOL positions
- 10-15 concurrent trades max
- Let winners run to 300%+

### Medium (10-50 SOL)  
- Default configuration works well
- 0.3-1.0 SOL positions
- Full 8 concurrent positions

### Large (50+ SOL)
- Increase daily spend cap
- 1.0-3.0 SOL positions  
- Consider higher concurrency

## Risk Management

### What's Aggressive
- Lower liquidity requirements (8 SOL)
- Higher rug tolerance (80%)
- Larger position sizes (2x multipliers)
- More concurrent positions (8 vs 3)

### What's Still Protected
- RugGuard ML model active
- Authority checks enforced
- Hard stop losses at 35%
- Daily loss caps in place

## Monitoring & Controls

### Dashboard Features
- Real-time position tracking
- P&L by position
- Social sentiment feeds
- Risk metrics

### Emergency Controls
```bash
# Stop all services
pkill -f trenches

# Flatten all positions (if configured)
curl -X POST localhost:4016/control/flatten

# Check system health
curl localhost:4010/healthz
```

## Expected Performance

### Conservative vs Aggressive Comparison
| Metric | Conservative | Trenches Default |
|--------|-------------|------------------|
| Daily trades | 3-5 | 15-30 |
| Position size | 0.05-0.1 SOL | 0.2-0.5 SOL |
| First exit | 50% profit | 100% profit |
| Risk per trade | 12% | 25% |
| Moonshot potential | Limited | 2000%+ targets |

### Bull Market Expectations
- **Monthly returns**: 50-150% (with higher risk)
- **Hit rate**: Lower individual wins, bigger winners
- **Max drawdown**: 20-35% during volatile periods
- **Moonshot captures**: Multiple 500%+ positions expected

## Troubleshooting

### Common Issues
- **No trades**: Check wallet funding and API connections
- **High rejections**: Verify RPC connection and data feeds
- **Memory issues**: Use provided memory fixes from Windows guide

### Performance Tuning
- Increase `dailySpendCapSol` for larger accounts
- Adjust `concurrencyCap` based on monitoring capacity
- Tune `rugThreshold` if too many false positives

## Support

- **GitHub Issues**: Report bugs and feature requests
- **Configuration**: All settings in `config/default.yaml`
- **Logs**: Check individual service logs for debugging

**Remember**: This system prioritizes maximum gains over safety. Perfect for bull markets and memecoin mania periods. Always trade with appropriate risk management for your situation.