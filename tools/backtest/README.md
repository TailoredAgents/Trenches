# Trenches Backtest / Replay

The CLI `trenches-replay` provides three workflows from the SQLite events log:

1) Print order plans
   npx trenches-replay --db ../../data/trenches.db --limit 50

2) POST order plans to executor
   npx trenches-replay --post --db ../../data/trenches.db
   (executor returns 503 without wallet; expected offline)

3) Serve SSE /events/plans for executor (replay)
   npx trenches-replay --serve-plans --port 4505 --speed 2 \
     --since 2025-01-01T00:00:00Z --until 2025-01-01T06:00:00Z --sample 100 --seed 1337
   Then start executor with POLICY_ENGINE_PORT=4505 to consume SSE plans.

Options
- --mint <MINT>         Filter by mint
- --since/--until ISO   Filter by time window (created_at)
- --sample N            Deterministic sub-sampling (with --seed)
- --csv path            Export a CSV of plans
- --replay-by-ts        Respect original time deltas in SSE replay (default true)

