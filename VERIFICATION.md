Trenches — Verification & Runbooks

Scope
- Verify offline-safe behavior, health/metrics endpoints, SSE streams, control APIs, exits logic, and UI panels.
- Cover failure drills: RPC failover, Jito outage, connector downtime, wallet missing; safe flatten; restart durability.

Prerequisites
- Node >= 20, pnpm, SQLite writable data dir (./data).
- Configure `.env` with `SOLANA_PRIMARY_RPC_URL` (defaults to `http://127.0.0.1:8899`).
- Set `SOLANA_WS_URL` when running a separate WebSocket endpoint and `SOLANA_RPC_HTTP_HEADERS` when the validator requires auth headers.
- No external credentials required for offline checks beyond optional RPC headers.

Build & Start
- npx pnpm install
- npx pnpm run typecheck && npx pnpm run lint
- npx pnpm --filter "./services/*" run build
- Start terminals:
  - agent-core: npx pnpm --filter services/agent-core start
  - position-manager: npx pnpm --filter services/position-manager start
  - optional: start other services similarly (social, onchain, safety, policy, executor, miner)

Health & Metrics
- curl http://127.0.0.1:4010/healthz → `{ status: "ok" }`
- curl http://127.0.0.1:4013/healthz → `{ dexscreener: true, birdeye: false|true, providers: { solanatracker: ... } }`
- curl http://127.0.0.1:4013/metrics → confirm `raydium_last_pool_slot`, `raydium_watcher_reconnects_total`, and cache miss counters exist
- curl http://127.0.0.1:4016/metrics → Prometheus text (exposure, exits)
- curl -D - --max-time 2 http://127.0.0.1:4017/events/topics → 200 headers (idle stream ok)
- curl -D - --max-time 2 http://127.0.0.1:4013/events/candidates → 200 headers (idle ok)

SSE Endpoints (smoke)
- Social:     curl -D - --max-time 2 http://127.0.0.1:4012/events/social
- Candidates: curl -D - --max-time 2 http://127.0.0.1:4013/events/candidates
- Safety:     curl -D - --max-time 2 http://127.0.0.1:4014/events/safe
- Plans:      curl -D - --max-time 2 http://127.0.0.1:4015/events/plans
- Topics:     curl -D - --max-time 2 http://127.0.0.1:4017/events/topics
- Agent:      curl -D - --max-time 2 http://127.0.0.1:4010/events/agent

Snapshot & UI
- curl http://127.0.0.1:4010/snapshot → Snapshot JSON
- UI: cd apps/ui-gateway && pnpm dev; open http://localhost:3000
- Verify panels: Social Radar (may be empty), Watch Windows, Positions, Service Health, Metrics, Controls.
- Congestion Meter bar reflects /api/policy congestion (p25/p50/p75/p90). Slot-Landing Histogram shows placeholder until Jito configured.

Controls (token-gated)
- Set KILL_SWITCH_TOKEN in env or .env
- Pause:  curl -X POST http://127.0.0.1:4010/control/pause  -H "Authorization: Bearer $KILL_SWITCH_TOKEN"
- Resume: curl -X POST http://127.0.0.1:4010/control/resume -H "Authorization: Bearer $KILL_SWITCH_TOKEN"
- Mode:   curl -X POST http://127.0.0.1:4010/control/mode   -H "Authorization: Bearer $KILL_SWITCH_TOKEN" -H "Content-Type: application/json" -d '{"mode":"SIM"}'
- Flatten: curl -X POST http://127.0.0.1:4010/control/flatten -H "Authorization: Bearer $KILL_SWITCH_TOKEN" → 503 awaiting_credentials until wallet ready (safe offline behavior)

Position Manager Logic
- Trails/Stops/Ladders
  - Trailing starts after +60% (trail 28%); hard stop −22%. Ladders fire at +50/+100/+200/+400 with shares 25/25/25/close.
- Autokill
  - Safety regression or flow collapse (buys/sells < 0.6 and uniques falling) triggers sell‑all.
- Durability
  - Restart position-manager; verify open positions rehydrate via listOpenPositions.

Backtest CLI
- Build: pnpm --filter @trenches/backtest build
- Print plans: npx trenches-replay --db ./data/trenches.db --limit 50
- POST plans to executor: npx trenches-replay --post  (executor answers 503 without wallet; expected)
- SSE plans for executor:
  - npx trenches-replay --serve-plans --port 4505 --speed 2
  - Start executor with POLICY_ENGINE_PORT=4505 to consume SSE /events/plans from replay server.

Failure Drills (offline)
- Wallet missing: policy-engine /healthz shows awaiting_credentials; agent /control/flatten returns 503 awaiting_credentials.
- Metrics server port: Only one global 8090 allowed; rely on per-service /metrics to avoid conflicts.
- Service crash/restart: kill a service; verify agent-core /healthz remains ok; restart service and watch /metrics.
- Connector downtime: social-ingestor /healthz shows degraded with specific missing env keys.
- SSE replay: run trenches-replay --serve-plans and point executor to that port via POLICY_ENGINE_PORT.

Promotion to Live (with credentials)
- Provide WALLET_KEYSTORE_PATH (+ passphrase), RPC/Jito endpoints, `SOLANA_RPC_HTTP_HEADERS` if required, and provider keys.
- Re-run the full health probe; verify policy/executor change to ok.
- Observe fills flowing to position-manager; verify exits and PnL.

Runbooks (summary)
- Rotate wallet: Stop policy/executor; update keystore path/passphrase; start policy then executor; verify /healthz.
- Kill & Flatten: Use /control/pause then /control/flatten; confirm position-manager exit submissions; resume when safe.
- RPC failover: Update SOLANA_PRIMARY_RPC_URL (and headers/WS if needed); restart onchain-discovery, safety-engine, policy-engine, executor, and position-manager; verify `/metrics` shows advancing `raydium_last_pool_slot` and zero auth errors.
- Dashboard issues: Check UI /api/health and /api/metrics; ensure services are bound to expected ports.
- SSE health: curl the endpoints listed above; expect 200 + headers even when idle.
