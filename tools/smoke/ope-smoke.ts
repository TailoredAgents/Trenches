import DatabaseConstructor from 'better-sqlite3';
function toEpoch(s?: string): number | undefined { if (!s) return undefined; const t = Date.parse(s); return Number.isFinite(t)? t : undefined; }
function nowIsoMinus(minutes: number): string { return new Date(Date.now() - minutes*60*1000).toISOString(); }

type OpeStats = { IPS:number; WIS:number; DR:number };

function combineWeights(rows: Array<{ ctx_json:string }>, rewardKey: 'pFill'|'reward', qhat: (ctx:any)=>number): OpeStats {
  let ipsNum=0, ipsDen=0; const wisSamples: Array<{w:number; r:number}> = []; let drNum=0, drDen=0;
  for (const r of rows) {
    let p=1, reward=0, w=1; let ctx:any={};
    try { ctx=JSON.parse(r.ctx_json||'{}'); const probs=ctx.probs as number[]|undefined; const ai=ctx.armIndex as number|undefined; p = probs && ai!=null ? probs[ai] : 1; const raw = ctx[rewardKey]; reward = typeof raw === 'number' ? raw : 1; } catch {}
    w = 1/Math.max(1e-6, p);
    ipsNum += w*reward; ipsDen += 1;
    wisSamples.push({ w, r: reward });
    const q = qhat(ctx); drNum += w*(reward - q) + q; drDen += w;
  }
  const sumw = wisSamples.reduce((a,x)=>a+x.w,0); const wis = sumw? wisSamples.reduce((a,x)=>a+(x.w/sumw)*x.r,0) : 0;
  return { IPS: ipsDen? ipsNum/ipsDen : 0, WIS: wis, DR: drDen? drNum/drDen : 0 };
}

async function run(policy: 'fee'|'sizing') {
  const dbPath = process.env.PERSISTENCE_SQLITE_PATH || './data/trenches.db';
  const db = new DatabaseConstructor(dbPath);
  const fromIso = nowIsoMinus(120); const toIso = new Date().toISOString();
  const fromTs = toEpoch(fromIso); const toTs = toEpoch(toIso);
  const where: string[]=[]; const params:any[]=[]; if (fromTs) { where.push('ts >= ?'); params.push(fromTs); } if (toTs) { where.push('ts <= ?'); params.push(toTs); }
  const table = policy==='fee' ? 'fee_decisions' : 'sizing_decisions';
  const rows = db.prepare(`SELECT ts, ctx_json FROM ${table} ${where.length?('WHERE '+where.join(' AND ')) : ''}`).all(...params) as Array<{ ts:number; ctx_json:string }>;
  function qhat(ctx:any): number { if (policy==='fee'){ const pFill = typeof ctx.pFill==='number'?ctx.pFill:0.9; const expSlip = typeof ctx.expSlipBps==='number'?ctx.expSlipBps:(ctx.exp_slip_bps||100); const feeBps = typeof ctx.feeBps==='number'?ctx.feeBps:50; const alphaProxy = typeof ctx.alphaProxyBps==='number'?ctx.alphaProxyBps:25; return pFill*((alphaProxy)-(expSlip)) - feeBps; } else { const pnl=Number(ctx.pnl_usd||0); const mae=Number(ctx.mae_usd||0); const slip=Number(ctx.slip_cost_usd||0); return pnl - 0.5*mae - 0.25*slip; } }
  const stats = combineWeights(rows, policy==='fee'?'pFill':'reward', qhat);
  if (![stats.IPS, stats.WIS, stats.DR].every((x)=>Number.isFinite(x))) { throw new Error('ope-smoke: non-finite score'); }
  console.log(`ope-smoke ${policy}`, { IPS: stats.IPS.toFixed(4), WIS: stats.WIS.toFixed(4), DR: stats.DR.toFixed(4) });
}

void (async () => { await run('fee'); await run('sizing'); })();






