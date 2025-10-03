CREATE TABLE IF NOT EXISTS author_features(
  author TEXT PRIMARY KEY,
  quality REAL NOT NULL,
  posts24h INTEGER NOT NULL,
  lastCalcTs INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pump_signals(
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  pump_prob REAL NOT NULL,
  samples INTEGER NOT NULL
);
