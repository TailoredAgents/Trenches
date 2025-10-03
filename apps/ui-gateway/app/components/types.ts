export type AgentMode = 'SIM' | 'SHADOW' | 'SEMI' | 'FULL';

export interface AgentSnapshot {
  status: string;
  pnl?: { day: number; week: number; month: number; prices?: { solUsdAgeSec?: number; ok?: boolean } };
  topics?: Array<{ topicId: string; label: string; sss: number; secondsLeft: number }>;
  candidates?: Array<{
    mint: string;
    name: string;
    lp: number;
    buys: number;
    sells: number;
    uniques: number;
    safetyOk: boolean;
    pool?: string | null;
    leaderHits?: number;
    leaderBoostEligible?: boolean;
  }>;
  positions?: Array<{
    mint: string;
    qty: number;
    avg: number;
    upl: number;
    targets: number[];
    trailPct: number;
  }>;
  risk?: { exposurePct: number; dailyLossPct: number };
  sizing?: { equity: number; free: number; tier: string; base: number; final: number };
  wallet?: { reserves: number; free: number; equity: number };
  health?: Record<string, number>;
  congestion?: string;
  latestMigrations?: Array<{ ts: number; mint: string; pool: string; source: string }>;
  migrationLag?: { p50: number; p95: number };
  rugGuard?: { passRate: number; avgRugProb: number };
  execution?: { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number };
  backtest?: { lastRunId: number; lastOverallNetPnl: number; landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number };
  shadow?: { feeDisagreePct: number; sizingDisagreePct: number };
  leader?: {
    recentHits: Array<{ pool: string; hits: number; lastSeenTs: number }>;
    topWallets: Array<{ wallet: string; score: number; lastSeenTs: number }>;
  };
}

export interface AgentEvent {
  at: string;
  type: string;
  payload: unknown;
}

export type LeaderWalletHitSummary = { pool: string; hits: number; lastSeenTs: number };


export type AgentMetricsSummary = {
  execution?: { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number };
  providers?: Record<string, { state?: string; status?: string; detail?: string; message?: string; lastSuccessTs?: number | null; lastSuccessAt?: string | null; lastEventTs?: number | null; lastPollTs?: number | null; apiKey?: boolean }>;
  discovery?: {
    providerCache?: {
      hits?: number;
      misses?: number;
      byProvider?: Record<string, { hits?: number; misses?: number }>;
    };
  };
  price?: { solUsdAgeSec: number | null; ok: boolean };
};
