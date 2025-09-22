import { setTimeout as delay } from 'timers/promises';
import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { TtlCache, TokenBucket } from '@trenches/util';
import { BirdeyePrice, BirdeyeTrendingToken } from './types';
import { birdeyeCacheHits, birdeyeCacheMisses } from './metrics';

const logger = createLogger('onchain:birdeye');

export class BirdeyeClient {
  private readonly priceCache: TtlCache<string, BirdeyePrice>;
  private readonly trendingCache: TtlCache<string, BirdeyeTrendingToken>;
  private readonly bucket: TokenBucket;
  private readonly baseUrl: string;

  constructor() {
    const cfg = getConfig();
    this.priceCache = new TtlCache(cfg.caching.birdeyeMultiPriceTtlSec * 1000);
    this.trendingCache = new TtlCache(cfg.caching.birdeyeTrendingTtlSec * 1000);
    const rpm = Number(process.env.BIRDEYE_RPM ?? '120');
    this.bucket = new TokenBucket(rpm / 60, rpm);
    this.baseUrl = process.env.BIRDEYE_BASE_URL ?? cfg.dataProviders.birdeyeBaseUrl;
  }

  async ensurePrices(addresses: string[]): Promise<void> {
    const targets = addresses
      .map((addr) => addr.trim())
      .filter((addr) => addr.length > 0 && !this.priceCache.has(addr));
    if (targets.length === 0) {
      targets.forEach((addr) => birdeyeCacheHits.inc({ type: 'price' }));
      return;
    }
    const cost = Math.max(1, Math.ceil(targets.length / 5));
    const waitMs = this.bucket.waitForToken(cost);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    try {
      const url = `${this.baseUrl}/public/multi_price?list_address=${targets.join(',')}`;
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': process.env.BIRDEYE_API_KEY ?? ''
        },
        keepalive: false
      });
      if (response.status === 429) {
        logger.warn('birdeye rate limited');
        targets.forEach(() => birdeyeCacheMisses.inc({ type: 'price' }));
        await delay(10_000);
        return;
      }
      if (!response.ok) {
        logger.error({ status: response.status }, 'birdeye price fetch failed');
        targets.forEach(() => birdeyeCacheMisses.inc({ type: 'price' }));
        return;
      }
      const payload = (await response.json()) as { data?: Record<string, BirdeyePrice> };
      for (const [address, price] of Object.entries(payload.data ?? {})) {
        this.priceCache.set(address, price);
      }
      targets.forEach((addr) => {
        if (this.priceCache.has(addr)) {
          birdeyeCacheHits.inc({ type: 'price' });
        } else {
          birdeyeCacheMisses.inc({ type: 'price' });
        }
      });
    } catch (err) {
      logger.error({ err }, 'birdeye price fetch threw');
      targets.forEach(() => birdeyeCacheMisses.inc({ type: 'price' }));
    }
  }

  getPrice(address: string): BirdeyePrice | undefined {
    const price = this.priceCache.get(address);
    if (price) {
      birdeyeCacheHits.inc({ type: 'price_lookup' });
    } else {
      birdeyeCacheMisses.inc({ type: 'price_lookup' });
    }
    return price;
  }

  async fetchTrending(timeframe: '1h' | '6h' | '24h' = '1h'): Promise<BirdeyeTrendingToken[]> {
    const waitMs = this.bucket.waitForToken(1);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    try {
      const url = `${this.baseUrl}/public/tokens/trending?time=${timeframe}`;
      const response = await fetch(url, {
        headers: {
          'X-API-KEY': process.env.BIRDEYE_API_KEY ?? ''
        },
        keepalive: false
      });
      if (response.status === 429) {
        logger.warn('birdeye trending rate limited');
        await delay(10_000);
        return [];
      }
      if (!response.ok) {
        logger.error({ status: response.status }, 'birdeye trending failed');
        return [];
      }
      const payload = (await response.json()) as { data?: { coins?: BirdeyeTrendingToken[] } };
      const tokens = payload.data?.coins ?? [];
      for (const token of tokens) {
        if (token.address) {
          this.trendingCache.set(token.address, token);
        }
      }
      return tokens;
    } catch (err) {
      logger.error({ err }, 'birdeye trending threw');
      return [];
    }
  }

  getTrendingCached(): BirdeyeTrendingToken[] {
    return this.trendingCache.entries().map(([, token]) => token);
  }
}
