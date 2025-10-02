# BOOTSTRAP (single RPC • SQLite-only • SSE • no X/Twitter)
Status: Phases A–E done. Pre-flight fixes in progress: real slippage, MAE, SSE reconnect helper, env samples, writeQueue usage, trainer metrics. Phase F NOT implemented.

Do next, in small PRs:
1) Pre-flight CHECKPOINT ONLY (finish & commit the fixes above; no new features).
2) Phase F, Slice 1: execution.migrationPreset (first-minute boost) + metrics + smoke.
Later slices: Route Quarantine, Leader Wallets, PnL/OPE polish, Price Updater.

Soak SLO guardrails (when ready): first-minute landed ≥0.94, p50 TTL ≤1.3s, avg slip ≤25 bps; overall landed ≥0.92; prices never stale >5m.
