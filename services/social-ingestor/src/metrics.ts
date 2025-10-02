import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const jetstreamEventsTotal: Counter<string> = registerCounter({
  name: 'jetstream_events_total',
  help: 'Total Bluesky Jetstream events received'
});

export const jetstreamErrorsTotal: Counter<string> = registerCounter({
  name: 'jetstream_errors_total',
  help: 'Total Bluesky Jetstream errors'
});

export const jetstreamLastEventTs: Gauge<string> = registerGauge({
  name: 'jetstream_last_event_ts',
  help: 'Unix timestamp of last Jetstream event'
});

// Generic per-provider metrics
export const sourceEventsTotal: Counter<string> = registerCounter({
  name: 'source_events_total',
  help: 'Total source events received',
  labelNames: ['source']
});

export const sourceErrorsTotal: Counter<string> = registerCounter({
  name: 'source_errors_total',
  help: 'Total source errors',
  labelNames: ['source', 'code']
});

export const sourceRateLimitedTotal: Counter<string> = registerCounter({
  name: 'source_rate_limited_total',
  help: 'Source rate limited occurrences',
  labelNames: ['source']
});
