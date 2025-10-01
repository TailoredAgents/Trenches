import DatabaseConstructor from 'better-sqlite3';
import { getPnLSummary } from '@trenches/persistence';

export type Metrics = { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number; count: number };

function quantile(arr: number[], p: number): number { if (arr.length === 0) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.floor((s.length-1)*p)]; }

export function computeExecMetrics(db: DatabaseConstructor, fromTs?: number, toTs?: number): Metrics {
  const where: string[] = [];
  const params: any[] = [];
  if (fromTs) { where.push('ts >= ?'); params.push(fromTs); }
  if (toTs) { where.push('ts <= ?'); params.push(toTs); }
  const sql = `SELECT filled, slippage_bps_real AS slip, time_to_land_ms AS ttl FROM exec_outcomes ${where.length?('WHERE '+where.join(' AND ')) : ''}`;
  const rows = db.prepare(sql).all(...params) as Array<{ filled:number; slip:number|null; ttl:number|null }>;
  if (rows.length === 0) return { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0, count: 0 };
  const filled = rows.reduce((a,r)=>a+(r.filled?1:0),0);
  const slips = rows.map(r=>r.slip??0);
  const ttls = rows.map(r=>r.ttl??0).filter(v=>Number.isFinite(v));
  const base = {
    landedRate: filled / rows.length,
    avgSlipBps: slips.reduce((a,b)=>a+b,0) / rows.length,
    p50Ttl: quantile(ttls, 0.5),
    p95Ttl: quantile(ttls, 0.95),
    count: rows.length
  };
  const pnl = getPnLSummary();
  // attach to console
  console.log('PnL summary', pnl);
  return base;
}
