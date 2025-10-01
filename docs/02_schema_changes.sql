-- Schema changes for PVP upgrade (SQLite-only)

-- Enable performance PRAGMAs on connect (documented; applied in code):
-- PRAGMA journal_mode=WAL;
-- PRAGMA synchronous=NORMAL;
-- PRAGMA temp_store=MEMORY;
-- PRAGMA mmap_size=268435456; -- 256MB

-- Core new tables
CREATE TABLE IF NOT EXISTS migration_events (
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  pool TEXT NOT NULL,
  source TEXT NOT NULL, -- 'pumpfun'|'pumpswap'|'raydium'
  init_sig TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_migration_events_mint_ts ON migration_events(mint, ts);

CREATE TABLE IF NOT EXISTS scores (
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  horizon TEXT NOT NULL, -- '10m'|'60m'|'24h'
  score REAL NOT NULL,
  features_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_mint_horizon_ts ON scores(mint, horizon, ts);

CREATE TABLE IF NOT EXISTS rug_verdicts (
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  rug_prob REAL NOT NULL,
  reasons_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rug_verdicts_mint_ts ON rug_verdicts(mint, ts);

CREATE TABLE IF NOT EXISTS fill_preds (
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  p_fill REAL NOT NULL,
  exp_slip_bps REAL NOT NULL,
  exp_time_ms INTEGER NOT NULL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fill_preds_route_ts ON fill_preds(route, ts);

CREATE TABLE IF NOT EXISTS fee_decisions (
  ts INTEGER NOT NULL,
  cu_price INTEGER NOT NULL,
  cu_limit INTEGER NOT NULL,
  slippage_bps INTEGER NOT NULL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fee_decisions_ts ON fee_decisions(ts);

-- Ensure sizing_decisions table has rich context (create if missing)
CREATE TABLE IF NOT EXISTS sizing_decisions (
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  arm TEXT NOT NULL,
  notional REAL NOT NULL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sizing_decisions_mint_ts ON sizing_decisions(mint, ts);

CREATE TABLE IF NOT EXISTS hazard_states (
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  hazard REAL NOT NULL,
  trail_bps INTEGER NOT NULL,
  ladder_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hazard_states_mint_ts ON hazard_states(mint, ts);

