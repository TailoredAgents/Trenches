CREATE TABLE IF NOT EXISTS prices (
  ts INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  usd REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts);

-- Extend exec_outcomes with extra fee/amount columns (best-effort)
ALTER TABLE exec_outcomes ADD COLUMN priority_fee_lamports INTEGER;
ALTER TABLE exec_outcomes ADD COLUMN amount_in INTEGER;
ALTER TABLE exec_outcomes ADD COLUMN amount_out INTEGER;
ALTER TABLE exec_outcomes ADD COLUMN fee_lamports_total INTEGER;
-- slippage_bps_real likely exists; if not, it will be added in prior migrations

