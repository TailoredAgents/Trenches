export type AgentMode = 'SIM' | 'SHADOW' | 'SEMI' | 'FULL';

export interface AgentSnapshot {
  status: string;
  pnl?: { day: number; week: number; month: number };
  topics?: Array<{ topicId: string; label: string; sss: number; secondsLeft: number }>;
  candidates?: Array<{
    mint: string;
    name: string;
    ocrs: number;
    lp: number;
    buys: number;
    sells: number;
    uniques: number;
    safetyOk: boolean;
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
}

export interface AgentEvent {
  at: string;
  type: string;
  payload: unknown;
}
