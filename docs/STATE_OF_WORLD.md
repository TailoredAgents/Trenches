# State of World (Services & Metrics)

## Leader Wallets
- Endpoints:
  - GET /healthz
  - GET /api/leader-hits
  - GET /api/leader-wallets/top
  - GET /events (SSE)
- Metrics:
  - leader_hits_total
  - leader_wallets_top{rank,wallet}

## Price Updater (Pyth)
- Endpoints:
  - GET /healthz
  - GET /metrics
- Metrics:
  - price_updater_runs_total
  - price_updater_last_success_ts
  - price_updater_stale_seconds
- UI:
  - Execution card shows Price: OK/Stale badge derived from snapshot price age.

## Offline ML Pack
- Features Job: computes author_quality nightly; persists into author_features.
- Pump Classifier: computes pump_prob; included as a RugGuard feature (soft signal).
