import { TokenCandidate } from '@trenches/shared';
import { getRecentLeaderHits } from '@trenches/persistence';
import { WalletSnapshot } from './types';

export type LeaderWalletConfig = {
  enabled: boolean;
  watchMinutes: number;
  minHitsForBoost: number;
  rankBoost: number;
  sizeTierBoost: number;
};

export type LeaderBoostInfo = {
  pool?: string | null;
  applied: boolean;
  hits: number;
  wallets: string[];
};

export type WalletCapsConfig = {
  perNameCapFraction: number;
  perNameCapMaxSol: number | null;
  lpImpactCapFraction: number;
  flowCapFraction: number;
  flowTradesPer5m: number;
  flowCapMinSol: number;
};

export function computeLeaderBoostInfo(
  candidate: TokenCandidate,
  cfg: LeaderWalletConfig,
  now = Date.now()
): LeaderBoostInfo {
  const pool = candidate.poolAddress ?? candidate.lpMint ?? null;
  if (!cfg?.enabled || !pool) {
    return { pool, applied: false, hits: 0, wallets: [] };
  }
  const since = now - Math.max(cfg.watchMinutes, 1) * 60_000;
  const hits = getRecentLeaderHits(pool, since);
  const uniqueWallets = Array.from(new Set(hits.map((h) => h.wallet))).slice(0, 5);
  const applied = hits.length >= cfg.minHitsForBoost;
  return { pool, applied, hits: hits.length, wallets: uniqueWallets };
}

export function applyLeaderSizeBoost(
  baseSize: number,
  candidate: TokenCandidate,
  wallet: WalletSnapshot,
  cfg: LeaderWalletConfig,
  info: LeaderBoostInfo,
  caps: WalletCapsConfig
): number {
  if (!cfg?.enabled || !info.applied || baseSize <= 0) {
    return baseSize;
  }
  const boostFactor = 1 + 0.25 * Math.max(cfg.sizeTierBoost, 0);
  const perMintCap = Math.min(caps.perNameCapFraction * wallet.equity, caps.perNameCapMaxSol ?? Infinity);
  const lpSol = Math.max(candidate.lpSol ?? 0, 0);
  const tradesPer5m = Math.max((candidate.buys60 ?? 0) + (candidate.sells60 ?? 0), 0);
  const flowRef = Math.max(caps.flowTradesPer5m ?? 60, 1);
  const flowScale = Math.min(1, tradesPer5m / flowRef);
  const flowCapacitySol = Math.max(lpSol * flowScale, caps.flowCapMinSol ?? 0);
  const impactCap = caps.lpImpactCapFraction * lpSol;
  const flowCap = caps.flowCapFraction * flowCapacitySol;
  const capValues = [wallet.free, wallet.spendRemaining, perMintCap, impactCap, flowCap]
    .filter((value) => Number.isFinite(value) && value > 0);
  const capLimit = capValues.length > 0 ? Math.min(...capValues) : baseSize;
  return Math.min(baseSize * boostFactor, capLimit);
}
