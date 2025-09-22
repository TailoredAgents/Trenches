-- 0001_init.sql
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS topics (
  topic_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sss REAL NOT NULL,
  novelty REAL NOT NULL,
  window_sec INTEGER NOT NULL,
  sources TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS topic_matches (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  match_score REAL NOT NULL,
  matched_at TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topic_windows (
  window_id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  label TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  state TEXT NOT NULL,
  metadata TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
  mint TEXT PRIMARY KEY,
  name TEXT,
  symbol TEXT,
  source TEXT NOT NULL,
  age_sec INTEGER NOT NULL,
  lp_sol REAL NOT NULL,
  buys60 INTEGER NOT NULL,
  sells60 INTEGER NOT NULL,
  uniques60 INTEGER NOT NULL,
  spread_bps REAL NOT NULL,
  safety_ok INTEGER NOT NULL,
  safety_reasons TEXT NOT NULL,
  ocrs REAL NOT NULL,
  topic_id TEXT,
  match_score REAL,
  first_seen_slot INTEGER,
  pool_address TEXT,
  lp_mint TEXT,
  pool_coin_account TEXT,
  pool_pc_account TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime(''now'')),
  updated_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  gate TEXT NOT NULL,
  size_sol REAL NOT NULL,
  slippage_bps INTEGER NOT NULL,
  jito_tip_lamports INTEGER NOT NULL,
  compute_unit_price INTEGER,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  side TEXT DEFAULT 'buy',
  token_amount REAL,
  expected_sol REAL,
  created_at TEXT NOT NULL DEFAULT (datetime(''now'')),
  updated_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS fills (
  signature TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  route TEXT NOT NULL,
  tip_lamports INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS positions (
  mint TEXT PRIMARY KEY,
  quantity REAL NOT NULL,
  quantity_raw REAL NOT NULL,
  average_price REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  ladder_hits TEXT NOT NULL,
  trail_active INTEGER NOT NULL,
  highest_price REAL NOT NULL,
  last_price REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS sizing_decisions (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  tier TEXT NOT NULL,
  size_sol REAL NOT NULL,
  reserves_sol REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime(''now''))
);

CREATE TABLE IF NOT EXISTS heartbeats (
  service TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  metadata TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime(''now''))
);
