export type SocialPlatform = 'farcaster' | 'bluesky' | 'reddit' | 'telegram' | 'gdelt';

export type SocialEngagement = {
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  impressions?: number;
  score?: number;
};

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  authorId: string;
  authorHandle?: string;
  text: string;
  lang?: string;
  link?: string;
  topics?: string[];
  tags?: string[];
  publishedAt: string; // ISO timestamp
  capturedAt: string; // ISO timestamp when ingested
  engagement: SocialEngagement;
  raw: Record<string, unknown>;
  source: string;
}

export type TopicEvent = {
  t: 'topic_spike';
  topicId: string;
  label: string;
  sss: number;
  decayedSss: number;
  novelty: number;
  windowSec: number;
  sources: string[];
  cluster: {
    phrases: string[];
    addedPhrases: string[];
    centroid: number[];
  };
};

export type TokenCandidate = {
  t: 'token_candidate';
  mint: string;
  name: string;
  symbol: string;
  source: 'raydium' | 'pumpfun' | 'other';
  ageSec: number;
  lpSol: number;
  buys60: number;
  sells60: number;
  uniques60: number;
  spreadBps: number;
  safety: { ok: boolean; reasons: string[] };
  ocrs: number;
  topicId?: string;
  matchScore?: number;
  poolAddress?: string;
  lpMint?: string;
  poolCoinAccount?: string;
  poolPcAccount?: string;
};

export type OrderPlan = {
  mint: string;
  gate: 'strict' | 'normal' | 'loose';
  sizeSol: number;
  slippageBps: number;
  jitoTipLamports: number;
  computeUnitPriceMicroLamports?: number;
  route: 'jupiter';
  side?: 'buy' | 'sell';
  tokenAmountLamports?: number;
  expectedSol?: number;
};

export type TradeEvent =
  | { t: 'order_plan'; plan: OrderPlan }
  | { t: 'fill'; mint: string; sig: string; px: number; qty: number; route: string; tip: number; slot: number; side?: 'buy' | 'sell' }
  | { t: 'exit'; mint: string; reason: 'tp' | 'trail' | 'stop' | 'autokill'; pnl: number }
  | { t: 'sizing'; equity: number; free: number; tier: string; caps: { equity: number; name: number; lp: number; flow: number }; final: number }
  | { t: 'health'; rpcMs: number; jitoMs: number; jupMs: number; mintsPerMin: number; poolsPerMin: number; swapsPerMin: number }
  | { t: 'alert'; level: 'info' | 'warn' | 'error'; msg: string };

export interface Snapshot {
  status: 'SCANNING' | 'CANDIDATE' | 'IN_TRADE' | 'PAUSED';
  pnl: { day: number; week: number; month: number };
  topics: Array<{ topicId: string; label: string; sss: number; secondsLeft: number }>;
  candidates: Array<{ mint: string; name: string; ocrs: number; lp: number; buys: number; sells: number; uniques: number; safetyOk: boolean }>;
  positions: Array<{ mint: string; qty: number; avg: number; upl: number; targets: number[]; trailPct: number }>;
  risk: { exposurePct: number; dailyLossPct: number };
  sizing: { equity: number; free: number; tier: string; base: number; final: number };
}

export type CongestionLevel = 'p25' | 'p50' | 'p75' | 'p90';
