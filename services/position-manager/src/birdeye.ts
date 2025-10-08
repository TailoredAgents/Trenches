import { createCachedFetcher } from '@trenches/util/providers/cacheClient';
import { getConfig } from '@trenches/config';

const DEFAULT_TTL_MS = 5_000;

export class BirdeyePriceOracle {
  private readonly fetcher: (url: string) => Promise<unknown>;
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private warned = false;

  constructor() {
    const config = getConfig();
    const rpm = Number(process.env.BIRDEYE_RPM ?? '120');
    const headers: Record<string, string> = {};
    if (process.env.BIRDEYE_API_KEY) {
      headers['X-API-KEY'] = process.env.BIRDEYE_API_KEY as string;
    }
    this.enabled = Boolean(process.env.BIRDEYE_API_KEY);
    this.fetcher = createCachedFetcher('birdeye', {
      ttlMs: DEFAULT_TTL_MS,
      rpmLimit: rpm,
      headers
    });
    this.baseUrl = process.env.BIRDEYE_BASE_URL ?? config.dataProviders.birdeyeBaseUrl;
  }

  async getPrice(mint: string): Promise<number | undefined> {
    if (!this.enabled) {
      if (!this.warned) {
        this.warned = true;
        // eslint-disable-next-line no-console
        console.warn('[BirdeyePriceOracle] Birdeye API key not configured; skipping price fetches');
      }
      return undefined;
    }
    const url = `${this.baseUrl}/public/multi_price?list_address=${mint}`;
    try {
      const payload = (await this.fetcher(url)) as { data?: Record<string, { price?: number }> };
      return payload.data?.[mint]?.price;
    } catch {
      return undefined;
    }
  }
}
