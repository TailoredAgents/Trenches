import DatabaseConstructor from 'better-sqlite3';

export type SimRow = {
  ts: number;
  mint: string;
  route: string;
  filled: number;
  quote_price: number;
  exec_price: number | null;
  slippageReq: number | null;
  slippageReal: number | null;
  timeToLandMs: number | null;
  cu_price: number | null;
  amountIn: number | null;
  amountOut: number | null;
  source: string;
};

export function loadSimExecOutcomes(db: DatabaseConstructor.Database, fromTs?: number, toTs?: number): SimRow[] {
  // For now, synthesize from historical summary tables if present; else fallback to empty.
  // If a sim table exists already, prefer it.
  try {
    const rows = db.prepare(
      `SELECT ts, mint, route, filled, quote_price, exec_price,
              slippage_bps_req AS slippageReq,
              slippage_bps_real AS slippageReal,
              time_to_land_ms AS timeToLandMs,
              cu_price,
              amount_in AS amountIn,
              amount_out AS amountOut,
              'sim' AS source
       FROM exec_outcomes
       WHERE (? IS NULL OR ts >= ?)
         AND (? IS NULL OR ts <= ?)`
    ).all(fromTs ?? null, fromTs ?? null, toTs ?? null, toTs ?? null) as any[];
    return rows.map((r) => ({ ...r, filled: Number(r.filled ?? 0) }));
  } catch {
    return [];
  }
}

