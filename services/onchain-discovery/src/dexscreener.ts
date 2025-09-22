import { setTimeout as delay } from 'timers/promises';
import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { TtlCache, TokenBucket } from '@trenches/util';
import { DexScreenerPair } from './types';
import { dexscreenerCacheHits, dexscreenerCacheMisses } from './metrics';

const logger = createLogger('onchain:dexscreener');

export class DexScreenerClient {
  private readonly pairCache: TtlCache<string, DexScreenerPair>;
  private readonly trendingCache: TtlCache<string, DexScreenerPair>;
  private readonly bucket: TokenBucket;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getConfig();
    this.pairCache = new TtlCache(cfg.caching.dexscreenerPairsTtlSec * 1000);
    this.trendingCache = new TtlCache(cfg.caching.dexscreenerTrendingTtlSec * 1000);
    const rpm = Number(process.env.DEXSCREENER_RPM ?? '60');
    this.bucket = new TokenBucket(rpm / 60, rpm);
    this.baseUrl = process.env.DEXSCREENER_BASE_URL ?? cfg.dataProviders.dexscreenerBaseUrl;
  }

  async ensurePairs(addresses: string[]): Promise<void> {
    const unique = Array.from(new Set(addresses.map((addr) => addr.trim()).filter(Boolean)));
    const cached = unique.filter((addr) => this.pairCache.has(addr));
    cached.forEach(() => dexscreenerCacheHits.inc({ type: 'pairs' }));
    const targets = unique.filter((addr) => !this.pairCache.has(addr));
    if (targets.length === 0) {
      return;
    }
    const cost = Math.max(1, Math.ceil(targets.length / 10));
    const waitMs = this.bucket.waitForToken(cost);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    try {
      const url = `${this.baseUrl}/latest/dex/pairs/solana/${targets.join(',')}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // DexScreener public API does not require an API key. If a partner key exists, include it; otherwise omit.
      if (process.env.DEXSCREENER_API_KEY) {
        headers['X-API-KEY'] = process.env.DEXSCREENER_API_KEY;
      }
      const response = await fetch(url, { headers, keepalive: false });
      if (response.status === 429) {
        logger.warn({ targets: targets.length }, 'dexscreener rate limited');
        targets.forEach(() => dexscreenerCacheMisses.inc({ type: 'pairs' }));
        await delay(5_000);
        return;
      }
      if (!response.ok) {
        logger.error({ status: response.status }, 'dexscreener pair fetch failed');
        targets.forEach(() => dexscreenerCacheMisses.inc({ type: 'pairs' }));
        return;
      }
      const payload = (await response.json()) as { pairs?: DexScreenerPair[] };
      for (const pair of payload.pairs ?? []) {
        this.pairCache.set(pair.pairAddress, pair);
      }
      targets.forEach((addr) => {
        if (this.pairCache.has(addr)) {
          dexscreenerCacheHits.inc({ type: 'pairs' });
        } else {
          dexscreenerCacheMisses.inc({ type: 'pairs' });
        }
      });
    } catch (err) {
      logger.error({ err }, 'dexscreener pair fetch threw');
      targets.forEach(() => dexscreenerCacheMisses.inc({ type: 'pairs' }));
    }
  }

  getPair(address: string): DexScreenerPair | undefined {
    const pair = this.pairCache.get(address);
    if (pair) {
      dexscreenerCacheHits.inc({ type: 'pair_lookup' });
    } else {
      dexscreenerCacheMisses.inc({ type: 'pair_lookup' });
    }
    return pair;
  }

  async fetchTrending(): Promise<DexScreenerPair[]> {
    const waitMs = this.bucket.waitForToken(1);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    try {
      const url = `${this.baseUrl}/latest/dex/trending?chain=solana`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.DEXSCREENER_API_KEY) {
        headers['X-API-KEY'] = process.env.DEXSCREENER_API_KEY;
      }
      const response = await fetch(url, { headers, keepalive: false });
      if (response.status === 429) {
        logger.warn('dexscreener trending rate limited');
        await delay(10_000);
        return [];
      }
      if (!response.ok) {
        logger.error({ status: response.status }, 'dexscreener trending failed');
        return [];
      }
      const payload = (await response.json()) as { pairs?: DexScreenerPair[] };
      const pairs = payload.pairs ?? [];
      for (const pair of pairs) {
        this.trendingCache.set(pair.pairAddress, pair);
        this.pairCache.set(pair.pairAddress, pair);
      }
      return pairs;
    } catch (err) {
      logger.error({ err }, 'dexscreener trending threw');
      return [];
    }
  }

  getTrendingCached(): DexScreenerPair[] {
    return this.trendingCache.entries().map(([, pair]) => pair);
  }
}
