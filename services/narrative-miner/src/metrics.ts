import type { Counter, Gauge, Histogram } from '@trenches/metrics';
import { registerCounter, registerGauge, registerHistogram } from '@trenches/metrics';

export const activeTopicsGauge: Gauge<string> = registerGauge({
  name: 'narrative_active_topics',
  help: 'Number of narrative topics currently tracked'
});

export const activeWatchWindowsGauge: Gauge<string> = registerGauge({
  name: 'narrative_watch_windows_active',
  help: 'Number of active watch windows'
});

export const topicEventsCounter: Counter<string> = registerCounter({
  name: 'narrative_topic_events_total',
  help: 'Total topic events emitted',
  labelNames: ['kind']
});

export const matchAttemptsCounter: Counter<string> = registerCounter({
  name: 'narrative_candidate_matches_attempted_total',
  help: 'Total candidate match attempts'
});

export const matchHitsCounter: Counter<string> = registerCounter({
  name: 'narrative_candidate_matches_total',
  help: 'Total candidate matches confirmed'
});

export const matchLatency: Histogram<string> = registerHistogram({
  name: 'narrative_candidate_match_latency_ms',
  help: 'Latency in milliseconds to compute candidate matches',
  buckets: [1, 2, 5, 10, 20, 35, 50]
});

export const ingestEventsCounter: Counter<string> = registerCounter({
  name: 'narrative_ingest_events_total',
  help: 'Incoming narrative miner events grouped by stream/result',
  labelNames: ['stream', 'result']
});

export const dedupeCacheGauge: Gauge<string> = registerGauge({
  name: 'narrative_dedupe_cache_size',
  help: 'Size of dedupe caches by stream',
  labelNames: ['stream']
});

// LunarCrush overlay metrics
export const lunarcrushLastPollTs: Gauge<string> = registerGauge({
  name: 'lunarcrush_last_poll_ts',
  help: 'Unix timestamp of last LunarCrush poll'
});

export const lunarcrushErrorsTotal: Counter<string> = registerCounter({
  name: 'lunarcrush_errors_total',
  help: 'Total errors from LunarCrush overlay'
});

export const lunarcrushBiasAppliedTotal: Counter<string> = registerCounter({
  name: 'lunarcrush_bias_applied_total',
  help: 'Total times LunarCrush bias was applied to SSS'
});
