import { TokenCandidate } from '@trenches/shared';

export type PositionState = {
  mint: string;
  quantity: number;
  quantityRaw: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  ladderHits: Set<number>;
  trailActive: boolean;
  highestPrice: number;
  decimals: number;
  lastPrice?: number;
};

export type ExitOrder = {
  mint: string;
  tokenAmountLamports: number;
  expectedSol?: number;
  reason: string;
};

export type PriceSnapshot = {
  price: number;
  timestamp: number;
};
