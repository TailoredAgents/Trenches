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

  const perNameCap = Math.min(config.wallet.perNameCapFraction * totalEquity, config.wallet.perNameCapMaxSol);
  caps.perName = perNameCap;

  const impactCap = config.wallet.lpImpactCapFraction * Math.max(candidate.lpSol, 0);
  caps.lpImpact = impactCap;

  const flowCap = config.wallet.flowCapFraction * Math.max(candidate.lpSol, 0);
  caps.flow = flowCap;

  const dailyCapRemaining = Math.max(config.wallet.dailySpendCapSol - wallet.spendUsed, 0);
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

  const finalSize = Math.max(Math.min(adjustedSize, freeEquity, dailyCapRemaining), 0);

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
