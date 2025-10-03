# Trenches Repo Recon

This document summarizes the purpose, structure, data flow, current heuristics, persistence, and UI surfaces of the Trenches agent as discovered from the codebase.

## Service Map

- services/agent-core
  - Inputs: @trenches/config, @trenches/persistence (SQLite), process env
  - Outputs: /snapshot JSON; /control/* (pause, resume, mode, flatten); /events/agent SSE; /healthz
  - SSE: /events/agent

- services/social-ingestor
  - Inputs: Farcaster/Neynar (API), Bluesky Jetstream (WSS), Reddit (OAuth), Telegram (TDLib/bot), GDELT; config.social
  - Outputs: SocialPost → @trenches/persistence (SQLite); /events/social SSE; /metrics; /healthz
  - SSE: /events/social

- services/narrative-miner
  - Inputs: /events/social (or deterministic mode), internal phrase extraction and clustering
  - Outputs: Topic windows and cluster updates to persistence; /events/topics SSE; /metrics; /healthz
  - SSE: /events/topics

- services/onchain-discovery
  - Inputs: Solana RPC (Raydium watcher via RPC/WS), DexScreener, Birdeye, SolanaTracker REST
  - Outputs: TokenCandidate persisted; /events/candidates SSE; /metrics; /healthz
  - SSE: /events/candidates

- services/safety-engine
  - Inputs: /events/candidates SSE (or override); Solana RPC for token/LP/holders
  - Outputs: Decorated TokenCandidate with safety and rugProb; /events/safe and /events/blocked SSE; persistence
  - SSE: /events/safe, /events/blocked

- services/policy-engine
  - Inputs: /events/safe SSE; wallet keystore; Solana RPC; config bandit and sizing
  - Outputs: OrderPlan via /events/plans SSE; logs policy actions; /metrics; /snapshot; /healthz
  - SSE: /events/plans

- services/executor
  - Inputs: /events/plans SSE; Solana RPC; Jupiter v6; optional Jito
  - Outputs: On-chain swaps, fills persisted; /events/trades SSE; /metrics; /healthz
  - SSE: /events/trades

- services/position-manager
  - Inputs: /events/trades SSE; Birdeye price oracle; Solana RPC
  - Outputs: Position state persisted; triggers exit OrderPlans to executor; /metrics; /healthz

- apps/ui-gateway (Next.js)
  - Inputs: agent-core /snapshot, per-service /metrics, /healthz
  - Outputs: Web UI; internal API aggregators /api/metrics, /api/health, /api/policy

## Critical Paths

1) Discovery → Safety → Policy/Sizing → Execution → Fills → Position Manager → Exits → Execution
2) Social → Narrative Miner → Topics/Windows (situational awareness)

## Current Heuristics & Thresholds

- Safety/RugGuard
  - Gating in config.gating: lpMinSol, buysSellRatioMin, uniquesMin, minPoolAgeSec, maxSpreadBps. RugGuard thresholds are handled in safety-engine.
  - RugGuard features/weights in services/safety-engine/src/rugguard.ts.

- Policy/Sizing
  - LinUCB bundles with gate, slippageBps, tipPercentile, sizeMultiplier.
  - Wallet caps and tiers; daily loss cap; minConfidence.

- Executor
  - Fixed slippage per bundle; Jito optional via config; Jupiter v6 for quotes/swaps.

- Position Manager
  - Ladder targets; trailing activate at trailActivatePct; trailPct; hardStopLossPct; autokill on safety regression/flow collapse.

## SQLite Tables

- topics, candidates, orders, fills, positions, events, sizing_decisions, heartbeats, bandit_state.
- Writers/Readers:
  - onchain-discovery → candidates
  - safety-engine → candidates (updates), events
  - policy-engine → events, sizing_decisions, bandit_state
  - executor → orders, fills, events
  - position-manager → positions, events
  - agent-core/narrative-miner → heartbeats/topics/windows

## UI Surfaces

- Dashboard panels for Snapshot, Social Radar, Watch Windows, Positions, Risk & Health, Metrics, Service Health.
- Aggregators in apps/ui-gateway/app/api/metrics and /api/health.

---

This recon reflects the repo at planning time and informs upgrade planning below.

