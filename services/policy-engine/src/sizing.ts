import { loadConfig } from '@trenches/config';
import { recordSizingDecision } from '@trenches/persistence';
import { TokenCandidate } from '@trenches/shared';
import { WalletSnapshot, SizingResult } from './types';

export function computeSizing(
  candidate: TokenCandidate,
  wallet: WalletSnapshot,
  actionMultiplier: number
): SizingResult {
  const config = loadConfig();
  const caps: Record<string, number> = {};

  const totalEquity = wallet.equity;
  const freeEquity = wallet.free;

  // Equity tier risk fraction
  let riskFraction = config.wallet.equityTiers[config.wallet.equityTiers.length - 1].riskFraction;
  for (const tier of config.wallet.equityTiers) {
    if (tier.maxEquity === null) {
      riskFraction = tier.riskFraction;
      break;
    }
    if (totalEquity >= tier.minEquity && totalEquity < tier.maxEquity) {
      riskFraction = tier.riskFraction;
      break;
    }
  }
  
  // Aggressive sizing: 2x position sizing for high-confidence and trending tokens
  const candidateAny = candidate as any;
  const isHighConfidence = candidateAny.social?.sss > 4.0 || candidateAny.alpha?.score > 0.7;
  const isTrending = candidateAny.social?.velocity > 1.5;
  
  if (isHighConfidence || isTrending) {
    riskFraction = Math.min(riskFraction * 2.0, 0.4); // 2x sizing, capped at 40%
  }

  const riskCap = freeEquity * riskFraction;
  caps.risk = riskCap;

  if (wallet.openPositions >= config.wallet.concurrencyCap) {
    caps.concurrency = 0;
    recordSizingDecision({
      mint: candidate.mint,
      equity: totalEquity,
      free: freeEquity,
      tier: `${riskFraction}`,
      caps,
      finalSize: 0,
      reason: 'concurrency_cap'
    });
    return { size: 0, base: 0, caps, tier: `${riskFraction}`, reason: 'concurrency_cap' };
  }

  const perNameCap = Math.min(config.wallet.perNameCapFraction * totalEquity, config.wallet.perNameCapMaxSol ?? Infinity);
  caps.perName = perNameCap;

  const lpSol = Math.max(candidate.lpSol ?? 0, 0);
  const impactCap = config.wallet.lpImpactCapFraction * lpSol;
  caps.lpImpact = impactCap;

  const flowRewriteEnabled = config.features?.flowCapRewrite !== false;
  let flowCap: number;
  if (flowRewriteEnabled) {
    const tradesPer5m = Math.max((candidate.buys60 ?? 0) + (candidate.sells60 ?? 0), 0);
    const flowRef = Math.max(config.wallet.flowTradesPer5m ?? 60, 1);
    const flowScale = Math.min(1, tradesPer5m / flowRef);
    const flowCapacitySol = Math.max(lpSol * flowScale, config.wallet.flowCapMinSol ?? 0);
    flowCap = config.wallet.flowCapFraction * flowCapacitySol;
  } else {
    flowCap = config.wallet.flowCapFraction * lpSol;
  }
  caps.flow = flowCap;

  const resolveDailyCap = (): number => {
    const pct = config.wallet.dailySpendCapPct;
    if (typeof pct === 'number' && pct > 0) {
      const cap = totalEquity * pct;
      if (Number.isFinite(cap) && cap > 0) {
        return cap;
      }
    }
    const absolute = config.wallet.dailySpendCapSol;
    if (typeof absolute === 'number' && absolute > 0) {
      return absolute;
    }
    return Number.POSITIVE_INFINITY;
  };
  const dailyCapRaw = resolveDailyCap();
  const dailyCapRemaining =
    dailyCapRaw === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(dailyCapRaw - wallet.spendUsed, 0);
  caps.daily = dailyCapRemaining;

  const baseSize = Math.max(Math.min(riskCap, perNameCap, impactCap, flowCap, dailyCapRemaining), 0);
  const scalerCfg = config.wallet.concurrencyScaler;
  const dynamicScaler = Math.max(
    scalerCfg.base - wallet.openPositions * 0.1,
    scalerCfg.base / 2
  );
  const concurrencyScaler = Math.min(dynamicScaler, scalerCfg.max);
  const adjustedSize = baseSize * actionMultiplier * concurrencyScaler;
  caps.multiplier = adjustedSize;

  const finalSize = Math.max(Math.min(adjustedSize, baseSize, freeEquity, dailyCapRemaining), 0);

  const reason = finalSize <= 0 ? 'no_available_size' : 'ok';

  recordSizingDecision({
    mint: candidate.mint,
    equity: totalEquity,
    free: freeEquity,
    tier: `${riskFraction}`,
    caps,
    finalSize,
    reason
  });

  return {
    size: finalSize,
    base: baseSize,
    caps,
    tier: `${riskFraction}`,
    reason
  };
}
