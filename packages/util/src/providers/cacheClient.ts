import { setTimeout as delay } from 'timers/promises';
import { TtlCache } from '../ttlCache';
import { TokenBucket } from '../tokenBucket';

function __getRegisterCounter(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@trenches/metrics');
    return mod && typeof mod.registerCounter === 'function' ? mod.registerCounter : null;
  } catch {
    return null;
  }
}

function __makeCounter(name: string, help: string): { inc: (labels?: Record<string, string>, value?: number) => void } {
  const reg = __getRegisterCounter();
  if (reg) {
    return reg({ name, help, labelNames: ['provider'] });
  }
  return { inc: () => void 0 };
}


const cacheHits = __makeCounter('provider_cache_hits_total', 'Provider cache hits');

const cacheMisses = __makeCounter('provider_cache_misses_total', 'Provider cache misses');

export type CachedFetcherOptions = {
  ttlMs: number;
  rpmLimit: number;
  headers?: Record<string, string>;
};

export function createCachedFetcher(
  provider: string,
  opts: CachedFetcherOptions
): (url: string) => Promise<unknown> {
  const { ttlMs, rpmLimit, headers = {} } = opts;
  const cache = new TtlCache<string, unknown>(ttlMs);
  const bucket = new TokenBucket(Math.max(1, rpmLimit) / 60, Math.max(1, rpmLimit));

  return async (url: string): Promise<unknown> => {
    const entry = cache.get(url);
    if (entry !== undefined) {
      cacheHits.inc({ provider });
      return entry;
    }
    cacheMisses.inc({ provider });
    const waitMs = bucket.waitForToken(1);
    if (waitMs > 0) {
      await delay(waitMs);
    }
    const res = await fetch(url, { headers, keepalive: false });
    if (!res.ok) {
      const err: any = new Error(`HTTP ${res.status} for ${provider}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    cache.set(url, json);
    return json;
  };
}
