#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';

const dbPath = process.env.SQLITE_DB_PATH ?? './data/trenches.db';
const db = new DatabaseConstructor(dbPath);

function quantile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)];
}

const rows = db.prepare('SELECT ts, quote_price, exec_price, filled, slippage_bps_real, time_to_land_ms FROM exec_outcomes ORDER BY ts DESC LIMIT 200').all() as Array<{ ts:number; quote_price:number; exec_price:number|null; filled:number; slippage_bps_real:number|null; time_to_land_ms:number|null }>;
if (rows.length === 0) {
  console.log('No exec_outcomes rows found. Run shadow orders first.');
  process.exit(0);
}
let filled=0; let sumSlip=0; let count=0; const ttls:number[]=[]; const preds:number[]=[]; const reals:number[]=[];
for (const r of rows) {
  count += 1; if (r.filled) filled += 1; if (r.slippage_bps_real!=null) sumSlip += r.slippage_bps_real; if (r.time_to_land_ms!=null) ttls.push(r.time_to_land_ms);
}
const landedRate = filled / count; const avgSlip = sumSlip / Math.max(1,count); const p50=quantile(ttls,0.5); const p95=quantile(ttls,0.95);
console.log('Execution Smoke Summary');
console.log('count',count,'filled',filled,'landedRate',landedRate.toFixed(3),'avgSlipBps',avgSlip.toFixed(1),'p50TTL',p50,'ms','p95TTL',p95,'ms');

