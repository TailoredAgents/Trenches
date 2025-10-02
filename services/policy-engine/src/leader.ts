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
  perNameCapMaxSol: number;
  lpImpactCapFraction: number;
  flowCapFraction: number;
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
  const perMintCap = Math.min(caps.perNameCapFraction * wallet.equity, caps.perNameCapMaxSol);
  const impactCap = caps.lpImpactCapFraction * Math.max(candidate.lpSol ?? 0, 0);
  const flowCap = caps.flowCapFraction * Math.max(candidate.lpSol ?? 0, 0);
  const capValues = [wallet.free, wallet.spendRemaining, perMintCap, impactCap, flowCap]
    .filter((value) => Number.isFinite(value) && value > 0);
  const capLimit = capValues.length > 0 ? Math.min(...capValues) : baseSize;
  return Math.min(baseSize * boostFactor, capLimit);
}
