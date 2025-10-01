# Executor Patch Map (Single RPC Aware)

Goal: Improve landed-rate and cost-efficiency with dynamic compute budget and adaptive slippage using single RPC.

## Files To Add

- services/executor/src/fillnet.ts
  - `export async function predictFill(route, params): Promise<FillPrediction>`
  - Input includes quote context (amounts, slippage, route, congestion proxy); returns P(fill), expected slippage bps, expected time to land.

- services/executor/src/fee-bandit.ts
  - `export function decideFees(context): FeeDecision`
  - Context includes congestion proxy, wallet free/equity, plan size, historical fill stats.

## Files To Modify

- services/executor/src/index.ts
  - Integrate `FeeBandit` and `FillNet` behind feature flags: `features.feeBandit`, `features.fillNet`.
  - Before quote: ask `FeeBandit` for initial `slippageBps`, `cuPrice`, `cuLimit`.
  - After quote: ask `FillNet` for `pFill`; if low or predicted slippage too high → re-quote with adjusted params or switch route (still Jupiter v6 but adjust `onlyDirectRoutes` and/or slippage).
  - On failure: add quote→exec fallback (re-quote, other route plan) with jittered blockhash refresh.
  - Metrics: landed-rate, fee bps, slippage bps (realized), time-to-land histograms.

- services/executor/src/jupiter.ts
  - Allow passing `computeUnitPriceMicroLamports` (already supported), add optional CU limit via compute budget ix (if needed, injected in sender path).

- services/executor/src/sender.ts
  - Add compute-budget ix injection when `cuLimit` is provided.
  - Refresh blockhash between retries with small jitter; record latency histograms.
  - Respect `features.jitoEnabled` (feature flag) rather than only presence of endpoints.

- packages/persistence/src/sqlite.ts
  - Add upsert functions for `fee_decisions` and `fill_preds` (per docs/02_schema_changes.sql).
  - Extend `recordFill` to attach realized slippage and fee bps (optional extra columns or pack into events table).

## Metrics

- Prometheus
  - `executor_landed_rate` (gauge)
  - `executor_fee_bps` (histogram)
  - `executor_slippage_bps` (histogram)
  - `executor_time_to_land_ms` (histogram)

## Feature Flags

`features.feeBandit`, `features.fillNet`, `features.jitoEnabled`

