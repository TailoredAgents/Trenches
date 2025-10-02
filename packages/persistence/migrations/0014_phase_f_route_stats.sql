CREATE TABLE IF NOT EXISTS route_stats (
  route TEXT NOT NULL,
  window_start_ts INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  fails INTEGER NOT NULL,
  avg_slip_real_bps REAL NOT NULL,
  avg_slip_exp_bps REAL NOT NULL,
  penalty REAL NOT NULL,
  PRIMARY KEY(route, window_start_ts)
);

CREATE INDEX IF NOT EXISTS idx_route_stats_ts ON route_stats(window_start_ts);
