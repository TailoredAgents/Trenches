import { createCachedFetcher } from '@trenches/util/providers/cacheClient';
import { getConfig } from '@trenches/config';
import { getNearestPrice } from '@trenches/persistence';

const DEFAULT_TTL_MS = 5_000;
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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
      const fallback = this.getFallbackPrice(mint);
      if (fallback !== undefined) {
        if (!this.warned) {
          this.warned = true;
          // eslint-disable-next-line no-console
          console.warn('[BirdeyePriceOracle] Birdeye API key not configured; using fallback price source');
        }
        return fallback;
      }
      if (!this.warned) {
        this.warned = true;
        // eslint-disable-next-line no-console
        console.warn('[BirdeyePriceOracle] Birdeye API key not configured; no fallback price available');
      }
      return undefined;
    }
    const url = `${this.baseUrl}/public/multi_price?list_address=${mint}`;
    try {
      const payload = (await this.fetcher(url)) as { data?: Record<string, { price?: number }> };
      const fetched = payload.data?.[mint]?.price;
      if (typeof fetched === 'number' && fetched > 0) {
        return fetched;
      }
      return this.getFallbackPrice(mint);
    } catch {
      return this.getFallbackPrice(mint);
    }
  }

  private getFallbackPrice(mint: string): number | undefined {
    const now = Date.now();
    if (mint === SOL_MINT) {
      const persisted = getNearestPrice(now, 'SOL');
      if (typeof persisted === 'number' && persisted > 0) {
        return persisted;
      }
      const hint = Number(process.env.SOL_PRICE_HINT ?? NaN);
      if (Number.isFinite(hint) && hint > 0) {
        return hint;
      }
    }
    return undefined;
  }
}
