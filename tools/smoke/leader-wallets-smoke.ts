#!/usr/bin/env tsx
import { loadConfig } from '@trenches/config';
import {
  insertMigrationEvent,
  insertLeaderHit,
  getRecentLeaderHits,
  upsertLeaderScore,
  getTopLeaderWallets
} from '@trenches/persistence';
import { TokenCandidate } from '@trenches/shared';
import { computeLeaderBoostInfo, applyLeaderSizeBoost } from '../../services/policy-engine/src/leader';
import { WalletSnapshot } from '../../services/policy-engine/src/types';

async function main() {
  const config = loadConfig({ forceReload: true });
  const leaderCfg = config.leaderWallets ?? {
    enabled: true,
    watchMinutes: 5,
    minHitsForBoost: 1,
    rankBoost: 0.03,
    sizeTierBoost: 1
  };

  const pool = 'SmokePool111111111111111111111111111111111';
  const mint = 'SmokeMint11111111111111111111111111111111';
  const wallet = 'SmokeWallet11111111111111111111111111111';
  const now = Date.now();

  insertMigrationEvent({ ts: now - 5_000, mint, pool, source: 'smoke', initSig: 'smokeSig' });

  for (let i = 0; i < Math.max(leaderCfg.minHitsForBoost, 2); i += 1) {
    insertLeaderHit({ pool, wallet, ts: now - i * 500 });
  }

  const lookback = now - Math.max(leaderCfg.watchMinutes, 1) * 60_000;
  const hits = getRecentLeaderHits(pool, lookback);
  if (hits.length < leaderCfg.minHitsForBoost) {
    throw new Error(`expected >=${leaderCfg.minHitsForBoost} hits, found ${hits.length}`);
  }

  upsertLeaderScore({ wallet, score: 0.12, lastSeenTs: now });
  const top = getTopLeaderWallets(5);
  const scoreRecorded = top.some((row) => row.wallet === wallet && (row.score ?? 0) >= 0.12);

  const candidate: TokenCandidate = {
    t: 'token_candidate',
    mint,
    name: 'SmokeToken',
    symbol: 'SMOKE',
    source: 'other',
    ageSec: 120,
    lpSol: 500,
    buys60: 25,
    sells60: 3,
    uniques60: 40,
    spreadBps: 45,
    safety: { ok: true, reasons: [] },
    poolAddress: pool
  };

  const walletSnapshot: WalletSnapshot = {
    equity: 50,
    free: 20,
    reserves: 0,
    openPositions: 0,
    spendUsed: 0,
    spendRemaining: 25
  };

  const leaderInfo = computeLeaderBoostInfo(candidate, leaderCfg, now);
  const baseScore = candidate.;
  const baseSize = 2;
  const boostedSize = applyLeaderSizeBoost(baseSize, candidate, walletSnapshot, leaderCfg, leaderInfo, {
    perNameCapFraction: config.wallet.perNameCapFraction,
    perNameCapMaxSol: config.wallet.perNameCapMaxSol,
    lpImpactCapFraction: config.wallet.lpImpactCapFraction,
    flowCapFraction: config.wallet.flowCapFraction
  });

  const boostApplied = leaderInfo.applied && boostedSize > baseSize;

  console.log(`leader-smoke: hits=${hits.length}, scoreUpdated=${scoreRecorded}, boostApplied=${boostApplied}`);
  if (!scoreRecorded || !boostApplied) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('leader-smoke failed', err);
  process.exit(1);
});

