# How Trenches Actually Finds Coins - Corrected Explanation

## The Real Data Sources

### **Social Sentiment**
- **LunarCrush API**: Social sentiment from Twitter/X, Reddit, and other platforms (every 3 minutes)
  - Gives 3% SSS boost for trending topics
  - 2% boost for influencer posts  
  - Max 6% total boost
- **Bluesky**: Real-time crypto discussions
- **Farcaster**: Crypto influencer network  
- **Telegram**: Configured channels (if you add any)
- **GDELT**: Global news sentiment
- **Reddit**: Still in config but LunarCrush covers this better

### **On-Chain Discovery**
- **Raydium**: Real-time new pool alerts
- **SolanaTracker**: Trending tokens every 8 seconds
- **DexScreener**: Popular pairs every 60 seconds

## The Improved Safety Thresholds ✅

**Updated Nov 2024** - Balanced approach to prevent manipulation while maintaining speed:

```yaml
# Improved balanced settings (vs previous aggressive)
lpMinSol: 15                   # Need 15+ SOL liquidity (was 8, originally 20)
buysSellRatioMin: 1.5          # Need 1.5x more buyers than sellers (unchanged)  
uniquesMin: 10                 # Need 10+ unique wallets trading (was 6, originally 12)
minPoolAgeSec: 15              # Pool must be 15+ seconds old (unchanged)
maxSpreadBps: 300              # Allow up to 3% spread (unchanged)

# Improved LP Safety
lpBurnThreshold: 0.7           # 70%+ LP must be burned (unchanged)
holderTopCap: 0.25             # Top holders can own 25% (was 35%, originally 20%)

# Fast-Entry Safety Minimums (NEW) ⚡
fastEntry:
  sssThreshold: 6.0            # Require SSS 6.0+ to trigger fast-entry (was 5.0)
  velocityThreshold: 2.5       # Require velocity 2.5+ to trigger fast-entry (was 2.0)
  minimumChecks:               # NEVER skip these, even in fast-entry mode:
    lpMinSol: 12               # Always require 12+ SOL even when trending
    uniquesMin: 8              # Always require 8+ traders even when trending
    lpBurnThreshold: 0.6       # Always require 60%+ LP burn even when trending
    maxRugProb: 0.9            # Always check rug probability (90% threshold)
    holderTopCap: 0.4          # Allow higher whale concentration (40%) in fast mode
```

## What "6+ Unique Traders" Actually Means

This is **on-chain data**, not social media. It means:

- **6 different wallet addresses** must have traded the token
- **Counted from blockchain transactions** (can't fake this easily)
- **Prevents single-wallet manipulation** where one person creates fake volume
- **BUT**: Someone with 6+ wallets could still game this

**Why this matters**: A real token getting organic interest will naturally have multiple people buying it. A fake pump usually starts with 1-2 wallets.

## Real Risks vs Non-Issues

### ✅ **Not Actually Problems**
- **Twitter/X coverage**: ✅ **Covered via LunarCrush** (aggregated social sentiment)
- **Reddit coverage**: ✅ **Covered via LunarCrush** + direct Reddit feeds
- **Expensive APIs**: ✅ **Solved** - LunarCrush aggregates multiple platforms

### ⚠️ **Remaining Vulnerabilities (Improved)**

**1. Moderate Manipulation Requirements** ✅ Improved
- Now need **10 wallets + 15 SOL** to fake organic interest (was 6 + 8)
- **Fast-entry mode** applies minimum checks instead of skipping all ✅
- **LunarCrush lag**: 3-minute delays could still miss rapid manipulation

**2. Social Engineering Attacks** ✅ Mitigated  
- Coordinate social posts across Bluesky + Farcaster + Telegram
- Create 10-wallet trading pattern with ~15+ SOL capital (higher cost)
- Trigger fast-entry mode → system still applies **minimum safety checks** ✅
- Even trending tokens blocked if they fail LP burn, rug probability, or liquidity checks ✅

**3. Real Blind Spots** ⚠️ Unchanged
- **No Discord monitoring** (where alpha often starts)
- **No private Telegram groups** (only public configured channels)
- **No cross-chain signals** (Ethereum trends affecting Solana)
- **No whale wallet analysis** (large holders accumulating)

## The Improved Fast-Entry Protection ✅

**New trigger conditions**: Social sentiment >6.0 OR momentum >2.5 (raised thresholds)
**What it does now**: **Applies minimum safety checks instead of bypassing all**

**Improved scenario**: 
1. Coordinated group posts about "SCAMCOIN" across platforms
2. LunarCrush picks up the buzz → SSS goes to 6.5
3. Fast-entry activates → applies **minimum safety checks**:
   - Still requires 12+ SOL liquidity (can't be micro-cap)
   - Still requires 8+ unique traders (harder to fake)
   - Still requires 60%+ LP burn (prevents obvious rugs)
   - Still checks rug probability <90% (ML model protection)
   - Allows higher whale concentration (40% vs 25% in normal mode)
4. If SCAMCOIN fails any minimum check → **blocked even when trending**

## Smart Money Tracking (Actually Works Well)

**Leader Wallets System**:
- Identifies wallets that consistently trade new tokens early and profitably
- Tracks their performance over 15-60 minutes  
- Gives 3% position size bonus when they trade something
- **This is actually pretty smart** - follows proven alpha generators

## Overall Assessment ✅ Improved

**Good**: 
- LunarCrush solves the expensive Twitter problem elegantly
- Multi-source coverage with reasonable costs
- Smart money tracking is sophisticated
- Real-time on-chain detection
- **Fast-entry mode now has safety minimums** ✅
- **Higher manipulation cost** (10 wallets + 15 SOL vs 6 + 8) ✅

**Remaining Risks** ⚠️:
- Missing Discord (major alpha source)
- No cross-chain trend analysis
- LunarCrush 3-minute lag vulnerability

**✅ Fixes Implemented**:
- **Raised normal thresholds**: 15 SOL liquidity, 10 unique traders
- **Fixed fast-entry mode**: Now applies minimum safety checks instead of bypassing all
- **Raised fast-entry bar**: SSS 6.0+ and velocity 2.5+ (vs 5.0 and 2.0)
- **Mandatory minimums**: Even trending tokens must pass LP burn, rug probability, and basic liquidity tests

**Final Recommendation**: The system now has **balanced speed vs safety**. Fast-entry mode is no longer a major vulnerability. The manipulation cost is significantly higher while maintaining speed advantages for legitimate opportunities.