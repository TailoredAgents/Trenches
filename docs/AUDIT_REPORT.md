# Repo Health & Gaps Audit

## Status Update
- Real slippage now persisted from executor fills (pre-flight fix complete).
- MAE telemetry flows from position manager into metrics storage.
- Shared SSE client with Last-Event-ID reconnect live across services.
- writeQueue usage updated to rely on shared helper without drift.
- Trainer runs emit calibration/validation metrics with each export.

## A. Unfinished / Placeholder Logic
- **High** services/executor/src/index.ts:350 – Realized slippage (`slipReal`) is hard-coded to 0, so exec outcomes and metrics never reflect fill quality.
  - Impact: downstream analytics and risk monitors treat every fill as perfect, hiding losses and breaking MAE/PNL analysis.
  - Next: compute realized slippage from the returned execution price vs. quote (or JIT quote) and persist the computed bps; update `updateArm` calls with the measured slip.
- **High** services/position-manager/src/index.ts:219 – `insertSizingOutcome` records `maeBps: 0`, so MAE telemetry required by UI spec is missing.
  - Impact: Net-PnL/MAE dashboard slice cannot surface drawdowns; survival stop tuning has no feedback loop.
  - Next: track peak adverse price per position (e.g., maintain `state.minPx`) and write the calculated `(maxDrawdown/entry)*10_000` into `maeBps` before persistence.
- **High** training/alpha_ranker/train.ts:2-9 – Trainer is a stub that writes constant weights with no dataset split or validation.
  - Impact: Production alpha scores never change and cannot be calibrated; any notion of horizons is misleading.
  - Next: load recent candidates/safety outcomes from SQLite, split train/validation, fit logistic (or gradient) model, persist metrics alongside weights.
- **High** training/fillnet/train.ts:2-14 – FillNet v2 trainer emits fixed coefficients and no calibration/validation.
  - Impact: Fill probability, expected slip, and time predictions stay static, making fee-bandit decisions stale.
  - Next: pull historical execution outcomes, fit regression models for pFill/slip/time, log validation error, and export calibrated JSON.
- **High** training/rugguard/train.ts:2-11 – RugGuard v2 trainer writes a hard-coded weight vector.
  - Impact: Rug probabilities never improve with new data; gating relies on stale heuristic weights.
  - Next: rebuild trainer to ingest labeled rugs vs. survivors, run logistic regression (or gradient boosted), export metrics with weights.
- **High** training/offline_rl/train.py:26-56 – Offline RL scaffold uses zero reward labels and writes dummy ONNX metadata.
  - Impact: Any offline policy/OPE experiments operate on a null model, blocking policy shadow rollout.
  - Next: integrate d3rlpy (IQL/CQL) to compute rewards from fills and export a real ONNX policy with evaluation stats.
- **Medium** tools/ope/src/ope.ts:47-55 – OPE tool sets WIS and DR estimates equal to IPS (placeholders).
  - Impact: Reported counterfactual metrics are overstated, giving false confidence in fee/sizing policies.
  - Next: implement weighted importance sampling and doubly robust estimators using stored propensities/rewards before writing backtest rows.
- **Medium** services/leader-wallets/src/index.ts:25-45 – `subscribePool` is never invoked; service creates tables but never tracks pools.
  - Impact: `leader_hits` and `leader_wallets` tables stay empty, leaving agent-core dashboards without leader data.
  - Next: ingest pool list (e.g., from migrations or DexScreener), call `subscribePool` per active pool, and surface metrics/health for backlog vs. connected streams.
- **Medium** services/rpc-monitor/src/index.ts:7-25 – Service exposes `/metrics` but never samples RPC health (slot lag, error rate, latency remain default 0).
  - Impact: No early warning for RPC degradation despite dedicated microservice.
  - Next: add periodic polling (getSlot, sendTransaction stubs) to update gauges/histogram and tie alerts to registry.

## B. Overlaps / Duplicated Logic
- **High** services/migration-watcher/src/index.ts:95-116 vs. services/onchain-discovery/src/rpcRaydium.ts:103-115 – Pool/mint resolution heuristics are duplicated.
  - Impact: Fixes to migration parsing must be copy-pasted; drift can cause inconsistent mint detection.
  - Next: move the normalization logic into `@trenches/shared` (e.g., `normalizeMigrationEvent`) and call it from both watcher and discovery.
- **Medium** services/executor/src/index.ts:228-285 duplicates fee/slippage selection that already lives in services/executor/src/fee-bandit.ts:67-102.
  - Impact: Two sources of truth drift; fee-bandit updates (context features, arm filtering) are not respected by manual fallback path.
  - Next: expose an ExecutionPolicy helper returning chosen arm & predictions, and let executor call that single abstraction for both static and LinUCB paths.
- **Medium** services/safety-engine/src/index.ts:257-269 repeats gating checks that policy-engine/src/index.ts:142-149 performs after RugGuard.
  - Impact: Safety rules (flow ratio, uniques, ocrs) are enforced twice with different thresholds, confusing root-cause for blocks.
  - Next: make RugGuard verdict canonical (return reasons), drop duplicate gating from policy engine, and surface thresholds in one place.

## C. Config & Feature Flag Hygiene
- **Medium** packages/config/src/schema.ts:289-304 – `features.rugGuard`, `features.jitoEnabled`, and `features.parquetExport` are defined but never read; toggling them has no effect.
  - Impact: Operators cannot disable RugGuard/Jito/parquet via config; dead flags mislead deployments.
  - Next: either wire these flags (e.g., guard rug classification, parquet exporters, Jito usage) or remove them and clean docs.
- **Medium** packages/config/src/schema.ts:329-360 & packages/config/src/index.ts:278-279 – `execution.routeRetryMs` and `execution.blockhashStaleMs` exist in schema/env map but executor never consumes them.
  - Impact: Retry cadence and blockhash refresh thresholds are hard-coded, violating single-RPC resiliency spec.
  - Next: thread these values into executor retry/backoff and transaction sender blockhash caching.
- **Medium** packages/config/src/index.ts:223-323 vs. env.example – numerous env overrides (`AGENT_CORE_PORT`, `POLICY_ENGINE_PORT`, `ONCHAIN_DISCOVERY_PORT`, `UI_PORT`, etc.) are missing from env.example.
  - Impact: Operators cannot discover required overrides; env/sample drift causes boot failures.
  - Next: add the missing keys with comments/defaults to env.example.
- **Low** env.example:41 (`MODE=SIM`) and 50 (`DEXSCREENER_USER_AGENT`) – these env vars are unused anywhere in the codebase.
  - Impact: Setup docs suggest knobs that do nothing.
  - Next: remove them or wire the values into config/loaders.

## D. SSE & Resilience Gaps
- **High** services/alpha-ranker/src/index.ts:21-44 – EventSource client has no reconnect/backoff or Last-Event-ID handling.
  - Impact: Safety-engine flaps drop alpha updates until manual restart.
  - Next: wrap in reconnect loop with exponential backoff, propagate `Last-Event-ID`, and resume missed events via `?since=` if supported.
- **High** services/position-manager/src/index.ts:116-142 – Position updates stream lacks retry/backoff and event id resume.
  - Impact: Any transient network or policy restart freezes position manager.
  - Next: add reconnect with jitter + re-subscribe using stored `lastEventId` and heartbeat watchdog.
- **High** services/executor/src/index.ts:149-170 – Plan stream only logs `source.onerror` and never re-establishes connection.
  - Impact: Executor silently stops consuming plans after first SSE hiccup.
  - Next: refactor `startPlanStream` to close and schedule reconnect (respecting `routeRetryMs`) and support Last-Event-ID.
- **High** services/safety-engine/src/index.ts:124-143 – Candidate stream lacks onerror handler and reconnect logic.
  - Impact: Safety engine blocks new candidates once SSE drops.
  - Next: mirror policy-engine style reconnect with exponential backoff and resume tokens.
- **High** services/onchain-discovery/src/index.ts:222-234 – Migration watcher EventSource has no reconnect/backoff; `logger.error` is a dead-end.
  - Impact: Primary candidate seed stops after transient network issues.
  - Next: implement retry loop with increasing delay and dedupe on last seen event id.
- **Medium** apps/ui-gateway/app/components/Dashboard.tsx:52-82 – Front-end EventSource closes on error but never reopens.
  - Impact: Dashboard permanently shows stale events after backend hiccups; manual refresh required.
  - Next: add reconnect timer and surface last reconnect attempt status to users.
- **Medium** services/policy-engine/src/index.ts:271-305 – Reconnect exists, but no Last-Event-ID or resume; events dropped during downtime.
  - Impact: Plans can be skipped causing inconsistent order flow.
  - Next: capture `event.lastEventId`, send via `Last-Event-ID` header, and optionally expose `/events/plans?since=` to replay.
- **Low** services/onchain-discovery/src/index.ts:200-217 & services/policy-engine/src/index.ts:123-173 – SSE servers omit heartbeat comments; proxies may time out idle clients.
  - Impact: Long-lived subscribers risk disconnect under load balancers.
  - Next: emit periodic `: ping

` (as agent-core already does) on all SSE endpoints.

## E. SQLite Hotspots & Write Path
- **Medium** services/agent-core/src/index.ts:392 querying `leader_hits` by `WHERE ts >= ?` lacks supporting index (table index is `pool, ts`).
  - Impact: Query scans entire table, causing WAL contention as leader-hits grows.
  - Next: add index `CREATE INDEX idx_leader_hits_ts_pool ON leader_hits(ts, pool)` via migration and re-seed.
- **Medium** packages/persistence/src/sqlite.ts:993 (`storeTokenCandidate`) is invoked by onchain-discovery, safety-engine, and narrative-miner concurrently without a `writeQueue`.
  - Impact: Competing processes can trigger `SQLITE_BUSY` spikes on the shared candidates table.
  - Next: introduce a per-process write queue (wrap inserts in `createWriteQueue`) or funnel writes through a single writer service.
- **Medium** services/leader-wallets/src/index.ts:36-39 – Inserts/updates run directly in the log callback with shared connection but without queueing; tables are also created outside central migrations.
  - Impact: Rapid log bursts can block other writers, and schema drift is possible when migrations move elsewhere.
  - Next: move DDL into migrations and push writes through a queue or batching worker.
- **Low** packages/persistence/src/sqlite.ts:1347 – `listOpenPositions` scans by `state != 'CLOSED'` without index.
  - Impact: Position dashboards degrade as table grows.
  - Next: add index on `(state)` or filter by boolean flag and create covering index.

## F. Single-RPC Assumptions
- **High** services/onchain-discovery/src/rpcRaydium.ts:30 instantiates `new Connection` directly, bypassing `createRpcConnection` helpers (no shared headers/timeouts).
  - Impact: Divergent RPC timeouts and missing header support break single-RPC configuration guarantees.
  - Next: swap to `createRpcConnection(config.rpc, {...})` and reuse derived options.
- **Medium** services/executor/src/sender.ts:24-53 fetches latest blockhash on every confirm and ignores `execution.blockhashStaleMs`.
  - Impact: Executor hammers RPC and cannot refresh blockhash proactively, risking stale hash failures.
  - Next: cache blockhash with configured staleness threshold and jitter before confirming/resenting.
- **Medium** services/executor/src/index.ts:24 & 318-340 – Retry loop hard-codes `MAX_RETRIES = 3` with zero backoff and ignores `execution.routeRetryMs`.
  - Impact: Rapid replays overwhelm single RPC endpoint and violate route quarantine policy.
  - Next: apply configurable retry delay with jitter and update route penalty bookkeeping per attempt.

## G. Metrics & UI Consistency
- **High** Missing priority fee & net PnL metrics – Executor metrics file lacks gauges for priority fee bps/SOL, and agent-core/position-manager never expose Net-PnL components despite docs/07 expectations.
  - Impact: Dashboard cannot satisfy KPI list (priority fee, Net-PnL breakdown, MAE) and operators lose visibility.
  - Next: add Prom metrics (`executor_priority_fee_bps`, `position_manager_mae_bps`, `agent_core_net_pnl_usd`) and extend `apps/ui-gateway/app/api/metrics/route.ts` aggregation.
- **Medium** services/leader-wallets/src/index.ts (entire file) exposes no Prom metrics for hits/top-count.
  - Impact: UI cannot display leader-wallet adoption; spec calls for metrics.
  - Next: register counters/gauges (hits per pool, unique leaders) and scrape them in UI gateway.
- **Low** apps/ui-gateway/app/api/metrics/route.ts:16-74 assumes executor/position-manager metrics exist but lacks guard for `undefined` keys (e.g., absent `position_manager_total_size_sol`).
  - Impact: When metrics missing, aggregator sets `undefined` which bubbles to UI as `NaN`.
  - Next: default to 0 and log gaps so dashboards remain legible.
