# Pre-flight Checkpoint (Telemetry + SSE)

## Summary
- executor: persist measured `slippage_bps_real` for fills and feed slip/TTL metrics alongside fee context.
- position-manager & persistence: maintain per-position MAE, add `positions.mae_bps`, and embed MAE when closing via sizing outcomes (migration `0013_preflight_mae.sql`).
- shared SSE client: unified reconnect/backoff + Last-Event-ID with short dedup TTL across executor, safety-engine, onchain-discovery, policy-engine, and dashboard.
- config/env: `features.jitoEnabled` now gates runtime Jito fallback; service ports documented in `env.example`.
- trainers: fillnet/alpha/rugguard scripts emit calibration metrics to stdout and stash summaries in exported model JSON.

## Build & Test
- `pnpm -r build`
- `pnpm smoke:exec`
- `pnpm smoke:survival`
- `pnpm smoke:sizing`
- `pnpm smoke:pnl`
- `pnpm smoke:alpha`
- `pnpm smoke:fillnet`

## Notes
- SSE helper is opt-in via `createSSEClient` and persists in-memory Last-Event-ID; services provide their EventSource factory and heartbeat filtering.
- No Phase F features (route quarantine, migration preset tweaks, leader wallet scoring, price updater) included in this checkpoint.
