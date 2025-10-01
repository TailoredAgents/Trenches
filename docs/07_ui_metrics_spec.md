# UI & Metrics Additions

## New KPIs / SLOs

- TTFB: pool create/first credible mention → first buy
- Landed-rate (% of submitted orders filled)
- Quote→Exec Slippage (bps)
- Priority Fee (bps and SOL)
- RugProb calibration view
- Net PnL after all costs
- Max Adverse Excursion (MAE)

## Data Sources

- Per-service `/metrics` plus new executor metrics (histograms & gauges).
- SQLite-backed `/api/metrics` aggregations can surface derived KPIs (optional) using current aggregator style.

## UI Panels (Dashboard)

- Execution KPIs: Landed-rate, slippage bps, fee bps, time-to-land sparkline.
- Safety Calibration: RugProb vs. realized outcomes (bin summary).
- AlphaRanker Leaderboard: top mints by 10m/60m/24h.
- TTFB Gauge for recent migrations.

## Minimal API Additions

- Extend `apps/ui-gateway/app/api/metrics/route.ts` to parse new executor metrics (if enabled) and expose:
  - `landedRate`, `slippageBps`, `feeBps`, `timeToLand` (aggregated)
  - (optional) `rugCalibration` bins from SQLite (future pass)

## Acceptance

- Panels render even when metrics absent (placeholders), preserving current resilient behavior.

