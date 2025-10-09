import { TokenCandidate } from '@trenches/shared';
import { BirdeyeClient } from './birdeye';
import { DexScreenerPair, PoolInitEvent } from './types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface CandidateContext {
  now: number;
  pool: PoolInitEvent;
  pair: DexScreenerPair;
  birdeye: BirdeyeClient;
}

export async function buildCandidate(ctx: CandidateContext): Promise<TokenCandidate | null> {
  const { pair, now, pool, birdeye } = ctx;
  const baseAddr = pair.baseToken?.address;
  if (!baseAddr) {
    return null;
  }
  const quoteAddr = pair.quoteToken?.address ?? '';
  await birdeye.ensurePrices([baseAddr, quoteAddr, SOL_MINT]);
  const quotePrice = quoteAddr ? birdeye.getPrice(quoteAddr)?.price : undefined;
  const solPrice = birdeye.getPrice(SOL_MINT)?.price ?? 0;

  const createdAtCandidates = [
    normalizeTimestamp(pair.createdAt),
    normalizeTimestamp(pair.pairCreatedAt),
    normalizeTimestamp(pool.timestamp),
    now
  ];
  const createdAt = createdAtCandidates.find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? now;
  const ageSec = Math.max(0, Math.floor((now - createdAt) / 1000));

  const liquiditySol = computeLiquiditySol(pair, quoteAddr, quotePrice, solPrice);

  const tx5m = pair.txns5m ?? pair.txns?.m5 ?? {};
  const buys60 = toNumber(tx5m.buys);
  const sells60 = toNumber(tx5m.sells);
  const uniques60 =
    toNumber(tx5m.buyers) + toNumber(tx5m.sellers) || Math.max(buys60 + sells60, 0);

  const spreadBps = computeSpreadBps(pair);

  const name = pair.baseToken.name ?? pair.baseToken.symbol ?? baseAddr;
  const symbol = pair.baseToken.symbol ?? (name.length <= 12 ? name : name.slice(0, 12));

  return {
    t: 'token_candidate',
    mint: baseAddr,
    name,
    symbol,
    source: 'raydium',
    ageSec,
    lpSol: liquiditySol,
    buys60,
    sells60,
    uniques60,
    spreadBps,
    safety: { ok: false, reasons: ['pending_safety_review'] },
    topicId: undefined,
    matchScore: undefined,
    lpMint: pool.lpMint ?? undefined,
    poolAddress: pool.pool ?? pair.pairAddress ?? undefined,
    poolCoinAccount: pool.poolCoinAccount ?? undefined,
    poolPcAccount: pool.poolPcAccount ?? undefined
  };
}

function computeLiquiditySol(
  pair: DexScreenerPair,
  quoteAddr: string,
  quotePrice?: number,
  solPrice?: number
): number {
  const { liquidity } = pair;
  const quoteLiquidity = toNumber(pair.liquidityInQuote ?? liquidity?.quote);
  const baseLiquidity = toNumber(pair.liquidityInBase ?? liquidity?.base);
  const usdLiquidity = toNumber(pair.liquidityInUsd ?? liquidity?.usd);
  if (quoteAddr && quoteAddr.toLowerCase() === SOL_MINT.toLowerCase()) {
    if (quoteLiquidity) return quoteLiquidity;
    if (usdLiquidity && solPrice) return usdLiquidity / solPrice;
  }
  const baseAddr = pair.baseToken?.address ?? '';
  if (baseAddr.toLowerCase() === SOL_MINT.toLowerCase()) {
    if (baseLiquidity) return baseLiquidity;
    if (usdLiquidity && solPrice) return usdLiquidity / solPrice;
  }
  if (usdLiquidity && solPrice) {
    return usdLiquidity / solPrice;
  }
  if (usdLiquidity && quotePrice) {
    return usdLiquidity / quotePrice;
  }
  return quoteLiquidity || baseLiquidity || 0;
}

function computeSpreadBps(pair: DexScreenerPair): number {
  const rawSpread = (pair as Record<string, unknown>)['priceSpreadPercent'];
  if (typeof rawSpread === 'number') {
    return Math.max(0, Math.round(rawSpread * 100));
  }
  const change = pair.priceChange?.m5 ?? pair.priceChange?.h1 ?? 0;
  if (change) {
    return Math.max(0, Math.round(Math.abs(change) * 100));
  }
  return 0;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
