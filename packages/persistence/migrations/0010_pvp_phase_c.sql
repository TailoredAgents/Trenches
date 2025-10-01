CREATE TABLE IF NOT EXISTS hazard_states(
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  hazard REAL NOT NULL,
  trail_bps INTEGER NOT NULL,
  ladder_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hazard_states_mint_ts ON hazard_states(mint, ts);

-- extend existing sizing_decisions with Phase C columns if missing
ALTER TABLE sizing_decisions ADD COLUMN ts INTEGER;
ALTER TABLE sizing_decisions ADD COLUMN arm TEXT;
ALTER TABLE sizing_decisions ADD COLUMN notional REAL;
ALTER TABLE sizing_decisions ADD COLUMN ctx_json TEXT;
CREATE INDEX IF NOT EXISTS idx_sizing_decisions_mint_ts ON sizing_decisions(mint, ts);

CREATE TABLE IF NOT EXISTS sizing_outcomes(
  ts INTEGER NOT NULL,
  mint TEXT NOT NULL,
  notional REAL NOT NULL,
  pnl_usd REAL NOT NULL,
  mae_bps REAL NOT NULL,
  closed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sizing_outcomes_ts ON sizing_outcomes(ts);

