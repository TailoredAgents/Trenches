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

export const landedRateGauge: Gauge<string> = registerGauge({
  name: 'executor_landed_rate',
  help: 'Landed rate of recent executions'
});

export const slipAvgGauge: Gauge<string> = registerGauge({
  name: 'executor_quote_exec_slip_bps_avg',
  help: 'Average realized slippage (bps)'
});

export const timeToLandHistogram = registerGauge({
  name: 'executor_time_to_land_ms',
  help: 'Last execution time to land (ms)'
});

export const retriesTotal: Counter<string> = registerCounter({
  name: 'executor_retries_total',
  help: 'Number of retries across executions'
});

export const fallbacksTotal: Counter<string> = registerCounter({
  name: 'executor_fallbacks_total',
  help: 'Number of fallbacks (re-quote/next arm)'
});

export const migrationPresetActive = registerGauge({
  name: 'executor_migration_preset_active',
  help: '1 if migration preset is active for current execution'
});

export const migrationPresetUses = registerCounter({
  name: 'executor_migration_preset_uses_total',
  help: 'Number of times migration preset adjusted fees/slippage',
  labelNames: ['mint', 'route']
});

export const routeAttemptsTotal = registerCounter({
  name: 'executor_route_attempts_total',
  help: 'Number of execution attempts per route',
  labelNames: ['route']
});

export const routeFailsTotal = registerCounter({
  name: 'executor_route_fails_total',
  help: 'Number of failed executions per route',
  labelNames: ['route']
});

export const routePenaltyGauge = registerGauge({
  name: 'executor_route_penalty',
  help: 'Route penalty score',
  labelNames: ['route']
});
export const routesExcludedTotal = registerCounter({
  name: 'executor_routes_excluded_total',
  help: 'Number of times a route was excluded by quarantine thresholds',
  labelNames: ['route']
});
