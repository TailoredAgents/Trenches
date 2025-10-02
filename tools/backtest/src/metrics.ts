import DatabaseConstructor from 'better-sqlite3';

export type ExecPnL = { netUsd: number; grossUsd: number; feeUsd: number; slipUsd: number };
export type Segments = { [segment: string]: ExecPnL };
export type ExecMetrics = { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number; count: number };
export type BacktestSummary = ExecPnL & { segments: Segments; metrics: ExecMetrics };

function quantile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((s.length - 1) * p);
  return s[idx];
}

function toMs(row: { created_at: string }): number {
  const iso = row.created_at.includes('T') ? row.created_at : row.created_at.replace(' ', 'T');
  const d = new Date(/Z$/.test(iso) ? iso : iso + 'Z');
  return d.getTime();
}

export function computeBacktestSummary(db: DatabaseConstructor, fromTs?: number, toTs?: number): BacktestSummary {
  const where: string[] = [];
  const params: any[] = [];
  if (fromTs) { where.push('ts >= ?'); params.push(fromTs); }
  if (toTs) { where.push('ts <= ?'); params.push(toTs); }
  const clause = where.length ? ('WHERE ' + where.join(' AND ')) : '';

  // Exec outcomes for costs + TTL quantiles
  const execRows = db.prepare(
    `SELECT ts, filled, slippage_bps_real AS slip, time_to_land_ms AS ttl, fee_lamports_total AS feeLamports, amount_in AS amountIn, route, priority_fee_lamports AS pri
     FROM exec_outcomes ${clause}`
  ).all(...params) as Array<{ ts:number; filled:number; slip:number|null; ttl:number|null; feeLamports:number|null; amountIn:number|null; route:string|null; pri:number|null }>;

  const ttls = execRows.map(r=> (r.ttl??0) as number).filter(v=>Number.isFinite(v));
  const ttlThresh = ttls.length ? quantile(ttls, 0.75) : 0;
  const priVals = execRows.map(r=> (r.pri??0) as number).filter(v=>Number.isFinite(v));
  const priThresh = priVals.length ? quantile(priVals, 0.75) : 0;

  // Helper: nearest fill by ts to retrieve mint + route
  const fillStmt = db.prepare(`SELECT mint, route, CAST(strftime('%s', created_at) AS INTEGER) * 1000 AS tsMs FROM fills ORDER BY tsMs`);
  const fillRows = fillStmt.all() as Array<{ mint:string; route:string; tsMs:number }>;

  function nearestFill(ts: number, route?: string|null): { mint?: string } {
    // binary search by tsMs
    let lo = 0, hi = fillRows.length - 1; let best: { mint?:string } = {}; let bestDelta = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const row = fillRows[mid];
      const delta = Math.abs(row.tsMs - ts);
      if (delta < bestDelta && (!route || !row.route || row.route === route)) { best = { mint: row.mint }; bestDelta = delta; }
      if (row.tsMs < ts) lo = mid + 1; else hi = mid - 1;
    }
    return bestDelta <= 5_000 ? best : {};
  }

  // Classify source via migration_events presence for mint
  const migStmt = db.prepare(`SELECT 1 FROM migration_events WHERE mint = ? LIMIT 1`);

  // Compute costs in USD
  function lamportsToUsd(lamports:number, ts:number): number {
    const row = db.prepare(`SELECT usd FROM prices WHERE symbol = 'SOL' AND ts <= ? ORDER BY ts DESC LIMIT 1`).get(ts) as { usd?: number } | undefined;
    const solUsd = typeof row?.usd === 'number' ? row!.usd : 0;
    return (lamports / 1_000_000_000) * solUsd;
  }

  let feeUsd = 0, slipUsd = 0, grossUsd = 0;

  // Gross from sizing_outcomes in window
  const grossWhere: string[] = [];
  const grossParams: any[] = [];
  if (fromTs) { grossWhere.push('ts >= ?'); grossParams.push(fromTs); }
  if (toTs) { grossWhere.push('ts <= ?'); grossParams.push(toTs); }
  const grossClause = grossWhere.length ? ('WHERE ' + grossWhere.join(' AND ')) : '';
  const srows = db.prepare(`SELECT ts, pnl_usd, mint FROM sizing_outcomes ${grossClause}`).all(...grossParams) as Array<{ ts:number; pnl_usd:number; mint:string }>;
  const sourceGross: Record<string, number> = { migration: 0, raydium: 0 };
  const regimeGross: Record<string, number> = { calm: 0, congested: 0 };
  for (const r of srows) {
    grossUsd += r.pnl_usd ?? 0;
    const hasMig = r.mint ? Boolean(migStmt.get(r.mint)) : false;
    const source = hasMig ? 'migration' : 'raydium';
    sourceGross[source] += r.pnl_usd ?? 0;
    // Regime based on nearest exec TTL/pri
    const nearestExec = execRows.reduce((best, row) => {
      const d = Math.abs(row.ts - r.ts);
      if (!best || d < best.d) return { d, row } as any; return best;
    }, null as any);
    const congested = nearestExec && ((nearestExec.row.ttl??0) > ttlThresh || (nearestExec.row.pri??0) > priThresh);
    regimeGross[congested ? 'congested' : 'calm'] += r.pnl_usd ?? 0;
  }

  // Fees & slip costs per exec outcome
  const sourceCosts: Record<string, ExecPnL> = { migration: { netUsd:0,grossUsd:0,feeUsd:0,slipUsd:0 }, raydium: { netUsd:0,grossUsd:0,feeUsd:0,slipUsd:0 } };
  const regimeCosts: Record<string, ExecPnL> = { calm: { netUsd:0,grossUsd:0,feeUsd:0,slipUsd:0 }, congested: { netUsd:0,grossUsd:0,feeUsd:0,slipUsd:0 } };

  for (const r of execRows) {
    if (!r.filled) continue;
    const mint = nearestFill(r.ts, r.route ?? undefined).mint;
    const hasMig = mint ? Boolean(migStmt.get(mint)) : false;
    const source = hasMig ? 'migration' : 'raydium';
    const congested = ((r.ttl ?? 0) > ttlThresh) || ((r.pri ?? 0) > priThresh);
    const regime = congested ? 'congested' : 'calm';
    const fee = lamportsToUsd(r.feeLamports ?? 0, r.ts);
    const inSol = (r.amountIn ?? 0) / 1_000_000_000;
    const usd = lamportsToUsd((r.amountIn ?? 0), r.ts);
    const slip = Math.abs(r.slip ?? 0) / 10_000 * inSol * (usd / Math.max(inSol, 1e-9));
    feeUsd += fee; slipUsd += slip;
    sourceCosts[source].feeUsd += fee; sourceCosts[source].slipUsd += slip;
    regimeCosts[regime].feeUsd += fee; regimeCosts[regime].slipUsd += slip;
  }

  const netUsd = grossUsd - feeUsd - slipUsd;
  const segments: Segments = {
    'source:migration': { netUsd: sourceGross.migration - sourceCosts.migration.feeUsd - sourceCosts.migration.slipUsd, grossUsd: sourceGross.migration, feeUsd: sourceCosts.migration.feeUsd, slipUsd: sourceCosts.migration.slipUsd },
    'source:raydium': { netUsd: sourceGross.raydium - sourceCosts.raydium.feeUsd - sourceCosts.raydium.slipUsd, grossUsd: sourceGross.raydium, feeUsd: sourceCosts.raydium.feeUsd, slipUsd: sourceCosts.raydium.slipUsd },
    'regime:calm': { netUsd: regimeGross.calm - regimeCosts.calm.feeUsd - regimeCosts.calm.slipUsd, grossUsd: regimeGross.calm, feeUsd: regimeCosts.calm.feeUsd, slipUsd: regimeCosts.calm.slipUsd },
    'regime:congested': { netUsd: regimeGross.congested - regimeCosts.congested.feeUsd - regimeCosts.congested.slipUsd, grossUsd: regimeGross.congested, feeUsd: regimeCosts.congested.feeUsd, slipUsd: regimeCosts.congested.slipUsd }
  };

  // Exec performance metrics
  const metrics: ExecMetrics = (() => {
    if (execRows.length === 0) return { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0, count: 0 };
    const filled = execRows.reduce((a,r)=>a+(r.filled?1:0),0);
    const slips = execRows.map(r=>r.slip??0);
    const ttls2 = execRows.map(r=>r.ttl??0).filter(v=>Number.isFinite(v));
    return { landedRate: filled/execRows.length, avgSlipBps: slips.reduce((a,b)=>a+b,0)/execRows.length, p50Ttl: quantile(ttls2,0.5), p95Ttl: quantile(ttls2,0.95), count: execRows.length };
  })();

  return { netUsd, grossUsd, feeUsd, slipUsd, segments, metrics };
}




