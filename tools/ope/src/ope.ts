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
  const sql = `SELECT ts, ctx_json FROM ${t} ${where.length?('WHERE '+where.join(' AND ')) : ''}`;
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

function quantile(arr: number[], p: number): number { if (arr.length===0) return 0; const s=[...arr].sort((a,b)=>a-b); const idx=Math.floor((s.length-1)*p); return s[idx]; }

type OpeStats = { IPS:number; WIS:number; DR:number };

function combineWeights(rows: Array<{ ctx_json:string }>, rewardKey: 'pFill'|'reward', qhat: (ctx:any)=>number): OpeStats {
  let ipsNum=0, ipsDen=0; const wisSamples: Array<{w:number; r:number}> = []; let drNum=0, drDen=0;
  for (const r of rows) {
    let p=1, reward=0, w=1; let ctx:any={};
    try {
      ctx = JSON.parse(r.ctx_json||'{}');
      const probs = ctx.probs as number[]|undefined; const ai = ctx.armIndex as number|undefined;
      p = probs && ai!=null ? probs[ai] : 1;
      const raw = ctx[rewardKey]; reward = typeof raw === 'number' ? raw : 1;
    } catch {}
    w = 1/Math.max(1e-6, p);
    ipsNum += w*reward; ipsDen += 1;
    wisSamples.push({ w, r: reward });
    const q = qhat(ctx);
    drNum += w*(reward - q) + q; drDen += w;
  }
  const sumw = wisSamples.reduce((a,x)=>a+x.w,0);
  const wis = sumw ? wisSamples.reduce((a,x)=>a + (x.w/sumw)*x.r, 0) : 0;
  return { IPS: ipsDen? ipsNum/ipsDen : 0, WIS: wis, DR: drDen? drNum/drDen : 0 };
}

async function main() {
  const db = new DatabaseConstructor(argv.db);
  const fromTs = toEpoch(argv.from);
  const toTs = toEpoch(argv.to);
  const which = argv.policy as 'fee'|'sizing';
  const rows = loadRows(db, which, fromTs, toTs);

  function qhat(ctx:any): number {
    if (which==='fee') {
      const pFill = typeof ctx.pFill==='number'?ctx.pFill:0.9;
      const expSlip = typeof ctx.expSlipBps==='number'?ctx.expSlipBps:(ctx.exp_slip_bps||100);
      const feeBps = typeof ctx.feeBps==='number'?ctx.feeBps:50;
      const alphaProxy = typeof ctx.alphaProxyBps==='number'?ctx.alphaProxyBps:25;
      return pFill*((alphaProxy)-(expSlip)) - feeBps;
    } else {
      const pnl=Number(ctx.pnl_usd||0); const mae=Number(ctx.mae_usd||0); const slip=Number(ctx.slip_cost_usd||0);
      return pnl - 0.5*mae - 0.25*slip;
    }
  }

  const overall = combineWeights(rows, which==='fee'?'pFill':'reward', qhat);

  // Segmentation: source (migration vs raydium) and regime (calm vs congested)
  const execRows = db.prepare(`SELECT ts, time_to_land_ms AS ttl, priority_fee_lamports AS pri FROM exec_outcomes`).all() as Array<{ ts:number; ttl:number|null; pri:number|null }>;
  const ttls = execRows.map(r=>r.ttl??0).filter(v=>Number.isFinite(v)); const priVals = execRows.map(r=>r.pri??0).filter(v=>Number.isFinite(v));
  const ttlThresh = ttls.length? quantile(ttls,0.75) : 0; const priThresh = priVals.length? quantile(priVals,0.75) : 0;
  const fills = db.prepare(`SELECT mint, CAST(strftime('%s', created_at) AS INTEGER) * 1000 AS tsMs FROM fills ORDER BY tsMs`).all() as Array<{ mint:string; tsMs:number }>;
  const migStmt = db.prepare(`SELECT 1 FROM migration_events WHERE mint = ? LIMIT 1`);

  function nearestExec(ts:number): { ttl:number; pri:number } | null {
    let best: any = null; let bestD = Infinity; for (const r of execRows) { const d=Math.abs(r.ts-ts); if (d<bestD){bestD=d; best=r;} }
    return best ? { ttl: (best.ttl??0) as number, pri: (best.pri??0) as number } : null;
  }
  function nearestMint(ts:number): string|undefined {
    let lo=0, hi=fills.length-1; let bestMint: string|undefined=undefined; let bestDelta=Infinity;
    while (lo<=hi) { const mid=(lo+hi)>>1; const row=fills[mid]; const delta=Math.abs(row.tsMs-ts); if (delta<bestDelta){bestDelta=delta; bestMint=row.mint;} if (row.tsMs<ts) lo=mid+1; else hi=mid-1; }
    return bestDelta<=5000 ? bestMint : undefined;
  }

  const segmentBuckets: Record<string, Array<{ ctx_json:string }>> = { 'source:migration':[], 'source:raydium':[], 'regime:calm':[], 'regime:congested':[] };
  for (const r of rows) {
    const ex = nearestExec(r.ts);
    if (ex) { const regime = (ex.ttl>ttlThresh || ex.pri>priThresh) ? 'regime:congested' : 'regime:calm'; segmentBuckets[regime].push(r as any); }
    const mint = nearestMint(r.ts); const src = mint && migStmt.get(mint) ? 'source:migration' : 'source:raydium'; segmentBuckets[src].push(r as any);
  }

  const segStats: Record<string, OpeStats> = {};
  for (const [seg, arr] of Object.entries(segmentBuckets)) {
    segStats[seg] = combineWeights(arr, which==='fee'?'pFill':'reward', qhat);
  }

  console.log('OPE', which, 'IPS', overall.IPS.toFixed(4), 'WIS', overall.WIS.toFixed(4), 'DR', overall.DR.toFixed(4));
  // Persist
  const { createBacktestRun, insertBacktestResult, finishBacktestRun } = await import('../../../packages/persistence/src/index');
  const runId = createBacktestRun({ from: argv.from, to: argv.to, policy: which }, 'ope');
  insertBacktestResult(runId, `OPE_IPS_${which}`, overall.IPS, 'overall');
  insertBacktestResult(runId, `OPE_WIS_${which}`, overall.WIS, 'overall');
  insertBacktestResult(runId, `OPE_DR_${which}`, overall.DR, 'overall');
  for (const [seg, s] of Object.entries(segStats)) {
    insertBacktestResult(runId, `OPE_IPS_${which}`, s.IPS, seg);
    insertBacktestResult(runId, `OPE_WIS_${which}`, s.WIS, seg);
    insertBacktestResult(runId, `OPE_DR_${which}`, s.DR, seg);
  }
  finishBacktestRun(runId);
}

main().catch((err) => { console.error(err); process.exit(1); });




