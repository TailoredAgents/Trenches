import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const poolsDiscovered: Counter<string> = registerCounter({
  name: 'raydium_pools_discovered_total',
  help: 'Number of Raydium pools detected'
});

export const candidatesEmitted: Counter<string> = registerCounter({
  name: 'token_candidates_emitted_total',
  help: 'Number of token candidates emitted'
});

export const dexscreenerCacheHits: Counter<string> = registerCounter({
  name: 'dexscreener_cache_hits_total',
  help: 'DexScreener cache hits',
  labelNames: ['type']
});

export const dexscreenerCacheMisses: Counter<string> = registerCounter({
  name: 'dexscreener_cache_misses_total',
  help: 'DexScreener cache misses',
  labelNames: ['type']
});

export const birdeyeCacheHits: Counter<string> = registerCounter({
  name: 'birdeye_cache_hits_total',
  help: 'Birdeye price cache hits',
  labelNames: ['type']
});

export const birdeyeCacheMisses: Counter<string> = registerCounter({
  name: 'birdeye_cache_misses_total',
  help: 'Birdeye price cache misses',
  labelNames: ['type']
});

export const lastPoolSlot: Gauge<string> = registerGauge({
  name: 'raydium_last_pool_slot',
  help: 'Slot number of last pool discovery'
});

// SolanaTracker metrics
export const stEventsTotal: Counter<string> = registerCounter({
  name: 'st_events_total',
  help: 'Total items processed from SolanaTracker'
});

export const stErrorsTotal: Counter<string> = registerCounter({
  name: 'st_errors_total',
  help: 'Total errors from SolanaTracker'
});

export const stLastPollTs: Gauge<string> = registerGauge({
  name: 'st_last_poll_ts',
  help: 'Unix timestamp of last SolanaTracker poll'
});
