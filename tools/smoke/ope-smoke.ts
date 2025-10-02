#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs';

const argv = yargs(hideBin(process.argv))
  .option('db', { type: 'string', default: './data/trenches.db' })
  .option('from', { type: 'string', default: '' })
  .option('to', { type: 'string', default: '' })
  .strict().parseSync();

function toEpoch(s?: string): number | undefined { if (!s) return undefined; const t = Date.parse(s); return Number.isFinite(t) ? t : undefined; }

function finite(v:number) { return Number.isFinite(v) && !Number.isNaN(v); }

function runOPE(db: DatabaseConstructor, policy: 'fee'|'sizing', fromTs?: number, toTs?: number) {
  const where: string[] = []; const params: any[] = [];
  if (fromTs) { where.push('ts >= ?'); params.push(fromTs); }
  if (toTs) { where.push('ts <= ?'); params.push(toTs); }
  const table = policy==='fee' ? 'fee_decisions' : 'sizing_decisions';
  const rows = db.prepare(`SELECT ctx_json FROM ${table} ${where.length?('WHERE '+where.join(' AND ')) : ''} LIMIT 200`).all(...params) as Array<{ ctx_json:string }>;
  function parseProbs(r:any): { p:number; reward:number } {
    try {
      const ctx = JSON.parse(r.ctx_json);
      const probs = ctx.probs as number[]|undefined; const ai = ctx.armIndex as number|undefined; const p = probs && ai!=null ? probs[ai] : 1;
      const reward = typeof ctx.pFill==='number' ? ctx.pFill : 1;
      return { p: Math.max(1e-6, p), reward };
    } catch { return { p: 1, reward: 0 }; }
  }
  const arr = rows.map(parseProbs);
  const ips = arr.length? arr.reduce((a,x)=>a + x.reward/x.p, 0) / arr.length : 0;
  const sumw = arr.reduce((a,x)=>a + 1/x.p, 0);
  const wis = sumw? arr.reduce((a,x)=>a + (1/x.p)/sumw * x.reward, 0) : 0;
  const dr = wis; // smoke uses WIS as proxy
  return { ips, wis, dr };
}

async function main() {
  const db = new DatabaseConstructor(argv.db);
  const fromTs = toEpoch(argv.from) ?? Date.now() - 60*60*1000;
  const toTs = toEpoch(argv.to) ?? Date.now();
  const fee = runOPE(db, 'fee', fromTs, toTs);
  const siz = runOPE(db, 'sizing', fromTs, toTs);
  console.log('ope-smoke', { fee, sizing: siz });
  if (![fee.ips, fee.wis, fee.dr, siz.ips, siz.wis, siz.dr].every(finite)) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
