CREATE TABLE IF NOT EXISTS leader_wallets (
  wallet TEXT PRIMARY KEY,
  score REAL NOT NULL,
  lastSeenTs INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leader_hits (
  pool TEXT NOT NULL,
  wallet TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (pool, wallet, ts)
);

CREATE INDEX IF NOT EXISTS idx_leader_hits_pool_ts ON leader_hits(pool, ts);
