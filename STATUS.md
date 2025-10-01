| Phase | Status | Evidence (files/endpoints/logs) | Gaps / Next actions |
| --- | --- | --- | --- |
| Bootstrap & Scaffolding | ✅ | `pnpm install` OK; `pnpm run typecheck` OK; `pnpm run lint` OK (no errors); services build OK | None |
| Connectors (Neynar/Jetstream/Reddit/TDLib/GDELT) | Partial | 4012 `/healthz` degraded (missing keys), `/metrics` 200; SSE 200 on `/events/social` | Provide API creds; validate reconnection + rate-limit handling |
| On-chain Discovery (DexS/Birdeye) | Partial | 4013 `/healthz` `{dexscreener:false,birdeye:false}`; `/metrics` 200; SSE 200 `/events/candidates` | Add provider keys; verify TTL caches + token bucket behavior |
| Safety & OCRS | Partial | 4014 `/healthz` OK; SSE 200 `/events/safe` and `/events/blocked`; metrics counters wired | Exercise with live candidates; tune OCRS / gates |
| Sizing & Policy | Partial | 4015 `/healthz` awaiting_credentials; SSE 200 `/events/plans`; bandit + sizing in place | Provide keystore; then exercise plan stream end-to-end |
| Executor (Jupiter+Jito+swQoS) | Partial | 4011 `/healthz` OK (RPC connected); `/metrics` 200 | Add wallet + Jito/Jupiter config; validate retries / tip logic |
| Fresh Narrative Miner | ✅ | 4017 `/healthz` OK; SSE 200 `/events/topics`; deterministic harness present (`src/harness.ts`) | Observe with live feeds when available |
| Position Manager | ✅ | 4016 `/healthz` OK; `/metrics` 200; exits (ladders/trail/hard stop/autokill); `/control/flatten` token-gated | Will execute exits once executor is live |
| UI Gateway | ✅ | Next.js 14 app (apps/ui-gateway) reading `/snapshot` + `/events/agent`; Health + Metrics panels; token controls; build OK | Slot-Landing switches to live once Jito telemetry available |
| Backtest & RL Tools | Partial | tools/backtest replay CLI (filters, CSV, sampling, timestamp-aware SSE); training/offline_rl scaffold | Add RL training script + ONNX loader (shadow) in policy-engine |
| CI / Deploy (systemd/Grafana) | Partial | `.github/workflows/ci.yml` builds apps/tools; systemd units (incl. UI); Jetson script; Grafana overview dashboard | Add tests to CI; expand dashboards; add per-env deploy notes |
| Hardening & Runbooks | Partial | VERIFICATION.md present; infra READMEs for systemd/Grafana | Add per-service SOPs and failure signatures; resource tuning notes |

Known blockers
- Port 8090 metrics endpoint is single-bind (from metrics package). Use per-service `/metrics` for each microservice.
- Wallet keystore/env required for policy-engine and execution readiness; executor does not trade without it.
- External API creds (Neynar/Bluesky/Reddit/Telegram) missing by design pre-credentials.
- Optional Jito and swQoS endpoints empty until provided.

Immediate next step
- If staying offline: optionally add per-service runbook SOPs and expand Grafana panels.
- To go live: provide wallet keystore + API keys, then validate policy→executor→fills→position-manager end-to-end.

Exact commands to proceed
- npx pnpm install
- npx pnpm run typecheck
- npx pnpm run lint
- npx pnpm --filter "./services/*" run build
- Start services (in separate terminals):
  - npx pnpm --filter services/agent-core start
  - npx pnpm --filter services/social-ingestor start
  - npx pnpm --filter services/onchain-discovery start
  - npx pnpm --filter services/safety-engine start
  - npx pnpm --filter services/policy-engine start
  - npx pnpm --filter services/executor start
  - npx pnpm --filter services/position-manager start
  - npx pnpm --filter services/narrative-miner start
- Probe:
  - for $p in 4010..4017,3000,8090: curl http://localhost:$p/healthz; curl http://localhost:$p/metrics
- UI Gateway: (from `apps/ui-gateway`) pnpm dev and open http://localhost:3000

Backtest & RL scaffolding
- Backtest CLI: tools/backtest (print/POST or serve timestamp-aware SSE; filters, CSV, sampling).
- RL: training/offline_rl scaffold present; policy shadow-loading TBD.

CI / Deploy scaffolding
- CI pipeline: `.github/workflows/ci.yml` runs install/typecheck/lint/build for services/apps/tools.
- Systemd units for all services + UI; Jetson setup script builds and enables units; Grafana overview dashboard.
