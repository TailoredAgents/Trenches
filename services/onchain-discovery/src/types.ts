import { Connection } from '@solana/web3.js';
import { TokenCandidate } from '@trenches/shared';

export type PoolInitEvent = {
  programId: string;
  pool: string;
  baseMint?: string;
  quoteMint?: string;
  lpMint?: string;
  poolCoinAccount?: string;
  poolPcAccount?: string;
  timestamp: string;
  slot: number;
  txHash: string;
};

export type DiscoveryEvents = {
  pool_init: (event: PoolInitEvent) => void;
  candidate: (candidate: TokenCandidate) => void;
};

export type RateLimitState = {
  allowance: number;
  lastRefill: number;
};

export type DiscoveryContext = {
  connection: Connection;
  persistence: {
    storeCandidate: (candidate: TokenCandidate) => void;
  };
};

export type DexScreenerPair = {
  pairAddress: string;
  chainId?: string;
  dexId?: string;
  url?: string;
  baseToken: { address: string; symbol?: string; name?: string };
  quoteToken: { address: string; symbol?: string; name?: string };
  liquidity?: {
    usd?: number;
    base?: number;
    quote?: number;
  };
  liquidityInUsd?: number;
  liquidityInQuote?: number;
  liquidityInBase?: number;
  priceUsd?: number;
  priceNative?: number;
  fdv?: number;
  marketCap?: number;
  volume24h?: number;
  volume?: {
    h24?: number;
    h6?: number;
    h1?: number;
    m5?: number;
  };
  txns1h?: { buys?: number; sells?: number; buyers?: number; sellers?: number };
  txns5m?: { buys?: number; sells?: number; buyers?: number; sellers?: number };
  txns?: {
    m5?: { buys?: number; sells?: number; buyers?: number; sellers?: number };
    h1?: { buys?: number; sells?: number; buyers?: number; sellers?: number };
  };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  createdAt?: number;
  pairCreatedAt?: number;
  info?: Record<string, unknown>;
  [key: string]: unknown;
};

export type BirdeyePrice = {
  symbol: string;
  address: string;
  price: number;
  updateUnixTime: number;
  volume: number;
  [key: string]: unknown;
};

export type BirdeyeTrendingToken = {
  address: string;
  symbol?: string;
  name?: string;
  score?: number;
  volume24h?: number;
  [key: string]: unknown;
};
