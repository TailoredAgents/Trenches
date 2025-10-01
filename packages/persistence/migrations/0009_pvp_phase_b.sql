CREATE TABLE IF NOT EXISTS fill_preds(
  ts INTEGER NOT NULL,
  route TEXT NOT NULL,
  p_fill REAL NOT NULL,
  exp_slip_bps REAL NOT NULL,
  exp_time_ms INTEGER NOT NULL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fill_preds_route_ts ON fill_preds(route, ts);

CREATE TABLE IF NOT EXISTS fee_decisions(
  ts INTEGER NOT NULL,
  cu_price INTEGER NOT NULL,
  cu_limit INTEGER NOT NULL,
  slippage_bps INTEGER NOT NULL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fee_decisions_ts ON fee_decisions(ts);

CREATE TABLE IF NOT EXISTS exec_outcomes(
  ts INTEGER NOT NULL,
  quote_price REAL NOT NULL,
  exec_price REAL,
  filled INTEGER NOT NULL,
  route TEXT,
  cu_price INTEGER,
  slippage_bps_req INTEGER,
  slippage_bps_real REAL,
  time_to_land_ms INTEGER,
  error_code TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_exec_outcomes_ts ON exec_outcomes(ts);

