# MASTER PLAN - PVP Upgrade (Single RPC, SQLite-Only)

This master plan consolidates changes, flags, and acceptance criteria for the upgrade.

## Feature Flags (config.features)

- migrationWatcher (default: true)
- alphaRanker (default: true)
- rugGuard (default: true)
- fillNet (default: true)
- feeBandit (default: true)
- constrainedSizing (default: true)
- survivalStops (default: true)
- jitoEnabled (default: false)
- parquetExport (default: false)

## Checklists

### A. Discovery & Schema
- [x] Add `services/migration-watcher` with SSE `/events/migrations`
- [x] Add `migration_events` table and persistence helpers
- [x] Wire onchain-discovery to consume `/events/migrations`

### B. Safety & Ranking
- [x] Implement `rugguard.ts`; integrate into safety-engine; persist `rug_verdicts`
- [x] Add `alpha-ranker` service; SSE `/events/scores` and persistence `scores`
- [x] Gate policy by `rugProb` threshold

### C. Execution & Sizing
- [x] Add `fillnet.ts` and `fee-bandit.ts`
- [x] Modify executor to use dynamic CU and adaptive slippage with fallbacks; record decisions in SQLite
- [x] Replace LinUCB sizing with constrained bandit; persist sizing decisions

### D. Survival Stops, RPC Monitor, Backtest, UI
- [x] Add survival-stops module; emit and persist `hazard_states`
- [x] Add `rpc-monitor` service with `/metrics`
- [x] Extend backtest to include latency/costs; read from SQLite
- [x] Extend UI metrics and panels for new KPIs

## Phase F - pending slices

- Slice 1: migration preset bootstrap + smoke validation
- Slice 2: Route Quarantine hardening
- Slice 3: Leader Wallets activation
- Slice 4: OPE polish & trainer alignment
- Slice 5: Price Updater automation

## Acceptance Criteria

- Discovery emits `MigrationEvent` within ~1s of relevant program logs.
- Safety exposes `RugGuardVerdict` and replaces legacy threshold gating; `rugProb` is persisted and visible in backtest.
- Executor logs fee/landing/slippage metrics; implements quote -> exec fallback; optional Jito bundles behind flag.
- Sizing respects risk caps with cVaR tilt; decisions persisted.
- Backtest produces net PnL after all costs and landed-rate KPI.
- UI displays TTFB, landed-rate, fee/slippage bps, RugProb calibration; remains resilient when metrics absent.

Note: X/Twitter intentionally disabled to avoid paid dependency.
