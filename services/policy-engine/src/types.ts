import { TokenCandidate, OrderPlan, CongestionLevel } from '@trenches/shared';

export type CandidateContext = {
  candidate: TokenCandidate;
  congestion: CongestionLevel;
  walletEquity: number;
  walletFree: number;
  dailySpendUsed: number;
  leaderWalletBoost?: { applied: boolean; hits: number; wallets: string[] };
};

export type BanditAction = {
  id: string;
  gate: 'strict' | 'normal' | 'loose';
  slippageBps: number;
  tipPercentile: CongestionLevel;
  sizeMultiplier: number;
};

export type BanditSelection = {
  action: BanditAction;
  expectedReward: number;
  confidence: number;
};

export type PlanEnvelope = {
  plan: OrderPlan;
  context: CandidateContext;
  selection: BanditSelection;
};

export type SizingResult = {
  size: number;
  base: number;
  caps: Record<string, number>;
  tier: string;
  reason: string;
};

export type WalletSnapshot = {
  equity: number;
  free: number;
  reserves: number;
  openPositions: number;
  spendUsed: number;
  spendRemaining: number;
};
