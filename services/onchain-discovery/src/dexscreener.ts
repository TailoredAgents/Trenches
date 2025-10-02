import { setTimeout as delay } from 'timers/promises';
import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { TtlCache } from '@trenches/util';
import { createCachedFetcher } from '@trenches/util/providers/cacheClient';
import { DexScreenerPair } from './types';

const logger = createLogger('onchain:dexscreener');

export class DexScreenerClient {
  private readonly pairCache: TtlCache<string, DexScreenerPair>;
  private readonly trendingCache: TtlCache<string, DexScreenerPair>;
  private readonly pairFetcher: (url: string) => Promise<unknown>;
  private readonly trendingFetcher: (url: string) => Promise<unknown>;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getConfig();
    this.pairCache = new TtlCache(cfg.caching.dexscreenerPairsTtlSec * 1000);
    this.trendingCache = new TtlCache(cfg.caching.dexscreenerTrendingTtlSec * 1000);
    const rpm = Number(process.env.DEXSCREENER_RPM ?? '60');
    const ua = process.env.DEXSCREENER_USER_AGENT ?? 'TrenchesBot/1.0';
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': ua };
    if (process.env.DEXSCREENER_API_KEY) {
      (baseHeaders as any)['X-API-KEY'] = process.env.DEXSCREENER_API_KEY as string;
    }
    this.pairFetcher = createCachedFetcher('dexscreener', {
      ttlMs: cfg.caching.dexscreenerPairsTtlSec * 1000,
      rpmLimit: rpm,
      headers: baseHeaders
    });
    this.trendingFetcher = createCachedFetcher('dexscreener', {
      ttlMs: cfg.caching.dexscreenerTrendingTtlSec * 1000,
      rpmLimit: rpm,
      headers: baseHeaders
    });
    this.baseUrl = process.env.DEXSCREENER_BASE_URL ?? cfg.dataProviders.dexscreenerBaseUrl;
  }

  async ensurePairs(addresses: string[]): Promise<void> {
    const unique = Array.from(new Set(addresses.map((addr) => addr.trim()).filter(Boolean)));
    const targets = unique.filter((addr) => !this.pairCache.has(addr));
    if (targets.length === 0) {
      return;
    }
    try {
      const url = `${this.baseUrl}/latest/dex/pairs/solana/${targets.join(',')}`; 
      const payload = (await this.pairFetcher(url)) as { pairs?: DexScreenerPair[] };
      for (const pair of payload.pairs ?? []) {
        this.pairCache.set(pair.pairAddress, pair);
      }
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 429) {
        logger.warn({ targets: targets.length }, 'dexscreener rate limited');
        await delay(5_000);
      } else {
        logger.error({ err }, 'dexscreener pair fetch threw');
      }
    }
  }

  getPair(address: string): DexScreenerPair | undefined {
    return this.pairCache.get(address);
  }

  async fetchTrending(): Promise<DexScreenerPair[]> {
    try {
      const url = `${this.baseUrl}/latest/dex/trending?chain=solana`;
      const payload = (await this.trendingFetcher(url)) as { pairs?: DexScreenerPair[] };
      const pairs = payload.pairs ?? [];
      for (const pair of pairs) {
        this.trendingCache.set(pair.pairAddress, pair);
        this.pairCache.set(pair.pairAddress, pair);
      }
      return pairs;
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 429) {
        logger.warn('dexscreener trending rate limited');
        await delay(10_000);
      } else {
        logger.error({ err }, 'dexscreener trending threw');
      }
      return [];
    }
  }

  getTrendingCached(): DexScreenerPair[] {
    return this.trendingCache.entries().map(([, pair]) => pair);
  }
}