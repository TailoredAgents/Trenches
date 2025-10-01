CREATE TABLE IF NOT EXISTS backtest_runs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_ts INTEGER NOT NULL,
  finished_ts INTEGER,
  params_json TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS backtest_results(
  run_id INTEGER NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  segment TEXT,
  PRIMARY KEY(run_id, metric, segment)
);

CREATE TABLE IF NOT EXISTS shadow_decisions_fee(
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  chosen_arm INTEGER NOT NULL,
  baseline_arm INTEGER,
  delta_reward_est REAL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shadow_fee_ts ON shadow_decisions_fee(ts);

CREATE TABLE IF NOT EXISTS shadow_decisions_sizing(
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  chosen_arm TEXT NOT NULL,
  baseline_arm TEXT,
  delta_reward_est REAL,
  ctx_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shadow_sizing_ts ON shadow_decisions_sizing(ts);

