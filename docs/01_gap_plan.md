# Gap Plan: Rip / Replace / Add

This plan targets PVP-grade capability using a single Solana RPC and SQLite-only storage. It preserves SSE wiring and avoids security scope for this pass.

## Dependency Graph (High-Level)

Discovery (MigrationWatcher) → Safety (RugGuard) → AlphaRanker → Policy (Constrained Bandit + FeeBandit + FillNet) → Executor (ComputeBudget + Fallback) → Position Manager (Survival-Stops) → UI/Metrics

Aux: rpc-monitor feeds metrics; backtest consumes SQLite logs to simulate reality.

## Rip / Replace

- Discovery
  - Replace Raydium-only detection path with a MigrationWatcher producing `MigrationEvent` for Pump.fun → PumpSwap/Raydium.
  - Keep Raydium/DexS/Birdeye as confirmation signals.

- Executor Policy
  - Replace static slippage/Jito tip selection with `ExecutionPolicy` comprised of `FillNet` (P(fill), E(slip), E(ttl)) and `FeeBandit` (cu price/limit, slippage).

- Safety/RugGuard
  - Replace hard-threshold legacy gating with `RugGuard` verdict (rugProb + reasons) incorporating authorities/LP/holders/blacklist/tax flags.

- Sizing
  - Replace LinUCB sizing with Constrained Contextual Bandit (cVaR-tilted reward, cap-aware) to choose notional.

## Add

- New Services
  - `migration-watcher` (SSE `/events/migrations`) reading program logs for Pump.fun & PumpSwap; emits `MigrationEvent`.
  - `alpha-ranker` (consumes `/events/safe`, emits `/events/scores`) producing `CandidateScore` across horizons.
  - `rpc-monitor` (exports `/metrics`) tracking RPC health, slot lag, tx error rates, latency histograms.

- Modules
  - `safety-engine/rugguard.ts` classifier API; integrated into safety flow to compute `RugGuardVerdict` and `rugProb`.
  - `executor/fillnet.ts` for fill predictions per route; `executor/fee-bandit.ts` for dynamic CU/slippage.
  - `policy-engine/sizing_constrained.ts` for risk-aware size decisions.
  - `position-manager/survival_stops.ts` for hazard-driven dynamic trailing/ladders.

## Feature Flags (config.features)

`migrationWatcher, alphaRanker, rugGuard, fillNet, feeBandit, constrainedSizing, survivalStops, jitoEnabled, parquetExport`

## Phasing (A/B/C/D)

- Phase A (Discovery & Schema)
  - Add MigrationWatcher service; add `migration_events` table; wire onchain-discovery to treat migration-first events as high-priority candidates with confirmers.
  - Keep current policy/executor; collect telemetry only.

- Phase B (Safety & Ranking)
  - Integrate RugGuard in safety-engine; emit and persist `rug_verdicts`; feed AlphaRanker; gate safe feed by `rugProb`.

- Phase C (Execution & Sizing)
  - Introduce FillNet + FeeBandit in executor path behind feature flags; add adaptive slippage and CU price/limit; add quote→exec fallback; optional Jito bundles.
  - Swap policy sizing to constrained bandit; persist sizing decisions with context.

- Phase D (Survival Stops, RPC Monitoring, Backtest, UI)
  - Add Survival-Stops in position-manager; add rpc-monitor service; extend backtest to include latency/fees/costs; add UI panels & SLO metrics.

## Non-Goals (Enforced)

- No multi-RPC. Single RPC with robust blockhash/compute budget handling.
- No external DB. SQLite primary; parquet/csv export stays disabled by default.
- No new message bus. Keep SSE topology.

