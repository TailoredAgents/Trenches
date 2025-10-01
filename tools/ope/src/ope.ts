#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('db', { type: 'string', default: './data/trenches.db' })
  .option('from', { type: 'string', default: '' })
  .option('to', { type: 'string', default: '' })
  .option('policy', { type: 'string', choices: ['fee', 'sizing'] as const, default: 'fee' })
  .option('segments', { type: 'string', default: 'overall' })
  .strict()
  .parseSync();

function toEpoch(s?: string): number | undefined { if (!s) return undefined; const t = Date.parse(s); return Number.isFinite(t) ? t : undefined; }

function loadRows(db: DatabaseConstructor, table: 'fee'|'sizing', fromTs?: number, toTs?: number) {
  const where: string[] = []; const params: any[] = [];
  if (fromTs) { where.push('ts >= ?'); params.push(fromTs); }
  if (toTs) { where.push('ts <= ?'); params.push(toTs); }
  const t = table === 'fee' ? 'fee_decisions' : 'sizing_decisions';
  const sql = `SELECT ts, ${table==='fee'?'rowid':''} ctx_json FROM ${t} ${where.length?('WHERE '+where.join(' AND ')) : ''}`;
  return db.prepare(sql).all(...params) as Array<{ ts:number; ctx_json:string }>;
}

function estimateIPS(rows: Array<{ ts:number; ctx_json:string }>): number {
  // For simplicity, treat reward r as 1 for filled (if available) else use logged pFill
  let num = 0; let den = 0;
  for (const r of rows) {
    try {
      const ctx = JSON.parse(r.ctx_json);
      const probs = ctx.probs as number[] | undefined;
      const armIndex = ctx.armIndex as number | undefined;
      const p = probs && armIndex!=null ? probs[armIndex] : 1;
      const reward = typeof ctx.pFill === 'number' ? ctx.pFill : 1;
      num += (1 / Math.max(1e-6, p)) * reward;
      den += 1;
    } catch {}
  }
  return den ? num / den : 0;
}

async function main() {
  const db = new DatabaseConstructor(argv.db);
  const fromTs = toEpoch(argv.from);
  const toTs = toEpoch(argv.to);
  const which = argv.policy as 'fee'|'sizing';
  const rows = loadRows(db, which, fromTs, toTs);
  const ips = estimateIPS(rows);
  const wis = ips; // placeholder same as IPS for now
  const dr = ips; // placeholder
  console.log('OPE', which, 'IPS', ips.toFixed(4), 'WIS', wis.toFixed(4), 'DR', dr.toFixed(4));
  // Persist
  const { createBacktestRun, insertBacktestResult, finishBacktestRun } = await import('@trenches/persistence');
  const runId = createBacktestRun({ from: argv.from, to: argv.to, policy: which }, 'ope');
  insertBacktestResult(runId, `OPE_IPS_${which}`, ips, 'overall');
  insertBacktestResult(runId, `OPE_WIS_${which}`, wis, 'overall');
  insertBacktestResult(runId, `OPE_DR_${which}`, dr, 'overall');
  finishBacktestRun(runId);
}

main().catch((err) => { console.error(err); process.exit(1); });

