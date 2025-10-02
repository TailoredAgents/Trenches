import { setTimeout as delay } from 'timers/promises';
import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { TtlCache } from '@trenches/util';
import { createCachedFetcher } from '@trenches/util/providers/cacheClient';
import { BirdeyePrice, BirdeyeTrendingToken } from './types';

const logger = createLogger('onchain:birdeye');

export class BirdeyeClient {
  private readonly priceCache: TtlCache<string, BirdeyePrice>;
  private readonly trendingCache: TtlCache<string, BirdeyeTrendingToken>;
  private readonly priceFetcher: (url: string) => Promise<unknown>;
  private readonly trendingFetcher: (url: string) => Promise<unknown>;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getConfig();
    this.priceCache = new TtlCache(cfg.caching.birdeyeMultiPriceTtlSec * 1000);
    this.trendingCache = new TtlCache(cfg.caching.birdeyeTrendingTtlSec * 1000);
    const rpm = Number(process.env.BIRDEYE_RPM ?? '120');
    const baseHeaders: Record<string, string> = {};
    if (process.env.BIRDEYE_API_KEY) {
      (baseHeaders as any)['X-API-KEY'] = process.env.BIRDEYE_API_KEY as string;
    }
    this.priceFetcher = createCachedFetcher('birdeye', { ttlMs: cfg.caching.birdeyeMultiPriceTtlSec * 1000, rpmLimit: rpm, headers: baseHeaders });
    this.trendingFetcher = createCachedFetcher('birdeye', { ttlMs: cfg.caching.birdeyeTrendingTtlSec * 1000, rpmLimit: rpm, headers: baseHeaders });
    this.baseUrl = process.env.BIRDEYE_BASE_URL ?? cfg.dataProviders.birdeyeBaseUrl;
  }

  async ensurePrices(addresses: string[]): Promise<void> {
    const targets = addresses
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0 && !this.priceCache.has(addr));
    if (targets.length === 0) {
      return;
    }
    try {
      const url = `${this.baseUrl}/public/multi_price?list_address=${targets.join(',')}`;
      const payload = (await this.priceFetcher(url)) as { data?: Record<string, BirdeyePrice> };
      for (const [address, price] of Object.entries(payload.data ?? {})) {
        this.priceCache.set(address, price);
      }
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 429) {
        logger.warn('birdeye rate limited');
        await delay(10_000);
      } else {
        logger.error({ err }, 'birdeye price fetch threw');
      }
    }
  }

  getPrice(address: string): BirdeyePrice | undefined {
    return this.priceCache.get(address);
  }

  async fetchTrending(timeframe: '1h' | '6h' | '24h' = '1h'): Promise<BirdeyeTrendingToken[]> {
    try {
      const url = `${this.baseUrl}/public/tokens/trending?time=${timeframe}`;
      const payload = (await this.trendingFetcher(url)) as { data?: { coins?: BirdeyeTrendingToken[] } };
      const tokens = payload.data?.coins ?? [];
      for (const token of tokens) {
        if (token.address) {
          this.trendingCache.set(token.address, token);
        }
      }
      return tokens;
    } catch (err) {
      const status = (err as any)?.status;
      if (status === 429) {
        logger.warn('birdeye trending rate limited');
        await delay(10_000);
      } else {
        logger.error({ err }, 'birdeye trending threw');
      }
      return [];
    }
  }

  getTrendingCached(): BirdeyeTrendingToken[] {
    return this.trendingCache.entries().map(([, token]) => token);
  }
}