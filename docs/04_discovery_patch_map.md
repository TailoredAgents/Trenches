# Discovery Patch Map: Migration-Aware

Goal: Detect Pump.fun → PumpSwap/Raydium migrations in near-real time and treat Raydium/Birdeye/DexScreener as confirmers.

## New Service

- services/migration-watcher/src/index.ts
  - Connects to single RPC (logs/programSubscribe).
  - Watches Pump.fun (token mint & launch), PumpSwap pool inits, Raydium AMM inits.
  - Emits `MigrationEvent` via `/events/migrations` SSE immediately.
  - Metrics: events seen, reconnects, errors.

## Modifications

- services/onchain-discovery
  - Add consumer for `/events/migrations` (local URL) to prioritize candidate emission.
  - Candidate builder: accept `source` in {pumpfun, pumpswap, raydium} and boost new-pool candidates on migration occurrence.
  - Keep DexScreener/Birdeye for confirmation and pricing.
  - Persist `migration_events` in SQLite when observed.

- packages/persistence/src/sqlite.ts
  - Add `storeMigrationEvent` and `listMigrationEvents` matching schema in docs/02_schema_changes.sql.

## Metrics

- `migration_events_total` counter (by source)
- `migration_confirmations_total` (by confirmer: dexscreener/birdeye)

## Feature Flag

`features.migrationWatcher`

