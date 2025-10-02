# UI & Metrics Additions

## New KPIs / SLOs

- executor_time_to_land_ms - TTFB from migration detection to first landed buy.
- executor_landed_rate - Share of submitted orders that fill within preset windows.
- executor_quote_exec_slip_bps_avg - Realized quote-to-exec slippage in basis points.
- position_manager_total_size_sol - Live exposure used for sizing and risk overlays.
- positions_opened_total - Volume context for opened positions and cadence.
- sqlite.positions.mae_bps - Max adverse excursion captured per position for MAE dashboards.
- rugguard_avg_rugprob - Calibration curve input for RugProb view.
- executor_priority_fee_bps (Phase F) - Priority fee bps surfaced once fee tracking is wired.
- agent_core_net_pnl_usd (Phase F) - Net PnL rollup once OPE polish lands.

## Data Sources

- Executor Prometheus metrics (executor_*) scraped every 5s.
- Position Manager Prometheus metrics plus SQLite MAE aggregates.
- Safety Engine Prometheus metrics for RugProb calibration.
- UI gateway /api/metrics aggregator combines the above for dashboards.

## UI Panels (Dashboard)

- Execution KPIs: landed rate, slippage bps, time-to-land sparkline, priority fee (Phase F).
- Safety Calibration: RugProb vs realized outcomes using rugguard_avg_rugprob and exit labels.
- Exposure Overview: opened positions, total SOL exposure, MAE trendline.
- Profitability (Phase F): net PnL after all costs once agent_core_net_pnl_usd is live.

## Minimal API Additions

- Extend apps/ui-gateway/app/api/metrics/route.ts to surface landedRate, slippageBps, timeToLand, priorityFeeBps (Phase F), maeBps, and RugProb bins.
- Persist MAE fields from SQLite into cache layer so UI can render historical slices.

## Acceptance

- Panels render even when metrics are absent, falling back to placeholders and zeroed values.
