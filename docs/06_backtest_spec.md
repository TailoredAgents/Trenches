# Backtest & Evaluation Spec (SQLite-backed)

## Goals

- Event-driven replay reflecting migrations, latency buckets, sandwiches, and actual costs.
- Read directly from SQLite: orders/fills/events, scores, decisions, rug verdicts.
- Report net PnL after priority fees and failures, landed-rate, quote→exec delta, drawdown/MAE.

## Inputs

- SQLite DB path(s). Optionally support daily shard attach.
- Time window filters (`--from`, `--to`), mint filter (`--mint`).
- Horizons selection for AlphaRanker.
- Costs on/off (priority-fee bps, failure costs, quote deltas).

## Outputs

- Console summary and optional CSV.
- Metrics: landed-rate, fee bps, slippage bps, time-to-land distributions, PnL net of costs, drawdown/MAE.

## CLI Shape (example)

```
pnpm backtest --from 2025-09-01 --to 2025-10-01 \
  --horizons 10m,60m --costs on --db ./data/trenches.db
```

## Data Sources (tables)

- `events` (order_plan/fill/exit/health)
- `orders`, `fills`
- `scores`, `rug_verdicts`, `fee_decisions`, `fill_preds`, `sizing_decisions`, `migration_events`

## Replay Logic

- Respect original timestamps (scaled by --speed) to simulate time-to-land and quote→exec deltas.
- Generate synthetic sandwiches/latency buckets if missing using configurable distributions.
- Apply priority fee costs and failed-tx costs to PnL.

## Reports

- Aggregate per regime (migration-first vs. later confirm), per horizon, per gate.
- RugProb calibration curve (binned), landed-rate over time, MAE distribution.

