import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const ordersReceived: Counter<string> = registerCounter({
  name: 'executor_orders_received_total',
  help: 'Number of order plans received from policy'
});

export const ordersSubmitted: Counter<string> = registerCounter({
  name: 'executor_orders_submitted_total',
  help: 'Number of orders submitted to Solana'
});

export const ordersFailed: Counter<string> = registerCounter({
  name: 'executor_orders_failed_total',
  help: 'Number of orders that failed',
  labelNames: ['stage']
});

export const fillsRecorded: Counter<string> = registerCounter({
  name: 'executor_fills_recorded_total',
  help: 'Number of fills recorded'
});

export const lastLatencyMs: Gauge<string> = registerGauge({
  name: 'executor_last_latency_ms',
  help: 'Latency of last successful execution in milliseconds'
});

export const jitoUsageGauge: Gauge<string> = registerGauge({
  name: 'executor_jito_bundle_usage',
  help: 'Number of bundles submitted via Jito'
});

export const simpleModeGauge: Gauge<string> = registerGauge({
  name: 'executor_simple_mode',
  help: '1 if executor running in simple mode, else 0'
});

export const flagJitoEnabled: Gauge<string> = registerGauge({
  name: 'executor_jito_enabled',
  help: '1 if Jito is enabled, else 0'
});

export const flagSecondaryRpcEnabled: Gauge<string> = registerGauge({
  name: 'executor_secondary_rpc_enabled',
  help: '1 if secondary RPC is enabled, else 0'
});

export const flagWsEnabled: Gauge<string> = registerGauge({
  name: 'executor_ws_enabled',
  help: '1 if WS is enabled, else 0'
});
