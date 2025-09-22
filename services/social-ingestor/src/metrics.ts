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

