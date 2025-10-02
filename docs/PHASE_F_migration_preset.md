# Phase F Slice 1 - Migration Preset

## Goals
- Deliver first-minute execution boost for fresh migrations without regressing steady-state fills.
- Keep preset behavior toggleable and observable so operations can bail out quickly.
- Align policy/executor knobs with trainer metrics gathered during pre-flight.

## Config Keys
- execution.migrationPreset.enabled (bool) - master switch for preset behavior.
- execution.migrationPreset.durationMs - window where preset stays fully applied.
- execution.migrationPreset.cuPriceBump - micro-lamport boost during preset window.
- execution.migrationPreset.minSlippageBps - floor for quote-to-exec slippage while preset is active.
- execution.migrationPreset.decayMs - linear decay period before returning to steady-state values.

## Metrics
- executor_migration_preset_active gauge - confirms when preset logic is engaged.
- executor_migration_preset_uses_total counter - tracks how often preset tuned fees/slippage.
- executor_quote_exec_slip_bps_avg gauge - watch realized slippage against preset targets.
- executor_time_to_land_ms gauge - track impact on time-to-fill during preset window.

## Smoke Outline
1. Enable preset via config/environment overrides and restart executor.
2. Trigger synthetic migration flow (backfill a migration event) and observe metrics bump.
3. Verify preset auto-decays after durationMs + decayMs with gauges returning to baseline.
4. Disable preset and confirm gauges drop to zero while fills still succeed.
