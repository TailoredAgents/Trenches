import fetch from 'node-fetch';
import { setTimeout as delay } from 'timers/promises';
import { TtlCache, TokenBucket } from '@trenches/util';
import { getConfig } from '@trenches/config';

const DEFAULT_TTL_MS = 5_000;

export class BirdeyePriceOracle {
  private readonly cache: TtlCache<string, number>;
  private readonly bucket: TokenBucket;
  private readonly baseUrl: string;

  constructor() {
    const config = getConfig();
    this.cache = new TtlCache(DEFAULT_TTL_MS);
    this.bucket = new TokenBucket(Number(process.env.BIRDEYE_RPM ?? '120') / 60, Number(process.env.BIRDEYE_RPM ?? '120'));
    this.baseUrl = process.env.BIRDEYE_BASE_URL ?? config.dataProviders.birdeyeBaseUrl;
  }

  async getPrice(mint: string): Promise<number | undefined> {
    const cached = this.cache.get(mint);
    if (cached !== undefined) {
      return cached;
    }
    const waitMs = this.bucket.waitForToken(1);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    const url = `${this.baseUrl}/public/multi_price?list_address=${mint}`;
    const resp = await fetch(url, {
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY ?? ''
      }
    });
    if (!resp.ok) {
      return undefined;
    }
    const payload = (await resp.json()) as { data?: Record<string, { price?: number }> };
    const price = payload.data?.[mint]?.price;
    if (price !== undefined) {
      this.cache.set(mint, price);
    }
    return price;
  }
}
