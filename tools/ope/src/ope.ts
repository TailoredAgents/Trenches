#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadConfig } from '@trenches/config';
import { quantileFloor } from '@trenches/util';

type Sample = { weight: number; reward: number; q: number };
type OpeStats = { IPS: number; WIS: number; DR: number; sampleCount: number; ess: number; ipsStderr: number; wisStderr: number; drStderr: number };

const argv = yargs(hideBin(process.argv))
  .option('db', { type: 'string', default: './data/trenches.db' })
  .option('from', { type: 'string', default: '' })
  .option('to', { type: 'string', default: '' })
  .option('policy', { type: 'string', choices: ['fee', 'sizing'] as const, default: 'fee' })
  .strict()
  .parseSync();

function toEpoch(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

function loadRows(db: DatabaseConstructor, table: 'fee' | 'sizing', fromTs?: number, toTs?: number) {
  const where: string[] = [];
  const params: any[] = [];
  if (fromTs) {
    where.push('ts >= ?');
    params.push(fromTs);
  }
  if (toTs) {
    where.push('ts <= ?');
    params.push(toTs);
  }
  const t = table === 'fee' ? 'fee_decisions' : 'sizing_decisions';
  const sql = `SELECT ts, ctx_json FROM ${t} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  return db.prepare(sql).all(...params) as Array<{ ts: number; ctx_json: string }>;
}

function collectSamples(rows: Array<{ ctx_json: string }>, rewardKey: 'pFill' | 'reward', qhat: (ctx: any) => number): Sample[] {
  const samples: Sample[] = [];
  for (const row of rows) {
    try {
      const ctx = JSON.parse(row.ctx_json ?? '{}');
      const probs = ctx.probs as number[] | undefined;
      const armIndex = ctx.armIndex as number | undefined;
      const propensity = probs && armIndex != null ? probs[armIndex] : 1;
      const rewardRaw = ctx[rewardKey];
      const reward = typeof rewardRaw === 'number' ? rewardRaw : 1;
      const weight = 1 / Math.max(1e-6, propensity);
      const q = qhat(ctx);
      samples.push({ weight, reward, q });
    } catch (err) {
      /* ignore invalid JSON context */
    }
  }
  return samples;
}

function computeStats(samples: Sample[]): OpeStats {
  const n = samples.length;
  if (n === 0) {
    return { IPS: 0, WIS: 0, DR: 0, sampleCount: 0, ess: 0, ipsStderr: 0, wisStderr: 0, drStderr: 0 };
  }
  const weights = samples.map((s) => s.weight);
  const rewards = samples.map((s) => s.reward);
  const qs = samples.map((s) => s.q);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumW2 = weights.reduce((a, b) => a + b * b, 0);
  const ipsVec = samples.map((s) => s.weight * s.reward);
  const ips = ipsVec.reduce((a, v) => a + v, 0) / n;
  const wis = sumW > 0 ? samples.reduce((acc, s) => acc + (s.weight / sumW) * s.reward, 0) : 0;
  const drVec = samples.map((s) => s.q + s.weight * (s.reward - s.q));
  const dr = drVec.reduce((a, v) => a + v, 0) / n;

  const ipsStderr = Math.sqrt(ipsVec.reduce((acc, v) => acc + (v - ips) * (v - ips), 0) / (n * Math.max(1, n - 1)));
  const wisStderr = sumW > 0 ? Math.sqrt(samples.reduce((acc, s) => {
    const wNorm = s.weight / sumW;
    return acc + wNorm * wNorm * (s.reward - wis) * (s.reward - wis);
  }, 0) / Math.max(1, n - 1)) : 0;
  const drStderr = Math.sqrt(drVec.reduce((acc, v) => acc + (v - dr) * (v - dr), 0) / (n * Math.max(1, n - 1)));
  const ess = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;

  return { IPS: ips, WIS: wis, DR: dr, sampleCount: n, ess, ipsStderr, wisStderr, drStderr };
}

async function main() {
  const cfg = loadConfig();
  const gating = (cfg.rollouts?.ope ?? { sampleMin: 0, minEss: 0, fee: {}, sizing: {} }) as {
    sampleMin: number;
    minEss: number;
    fee: { minIps?: number; minWis?: number; minDr?: number };
    sizing: { minIps?: number; minWis?: number; minDr?: number };
  };
  const db = new DatabaseConstructor(argv.db);
  const fromTs = toEpoch(argv.from);
  const toTs = toEpoch(argv.to);
  const which = argv.policy as 'fee' | 'sizing';
  const rows = loadRows(db, which, fromTs, toTs);

  function qhat(ctx: any): number {
    if (which === 'fee') {
      const pFill = typeof ctx.pFill === 'number' ? ctx.pFill : 0.9;
      const expSlip = typeof ctx.expSlipBps === 'number' ? ctx.expSlipBps : ctx.exp_slip_bps ?? 100;
      const feeBps = typeof ctx.feeBps === 'number' ? ctx.feeBps : 50;
      const alphaProxy = typeof ctx.alphaProxyBps === 'number' ? ctx.alphaProxyBps : 25;
      return pFill * (alphaProxy - expSlip) - feeBps;
    }
    const pnl = Number(ctx.pnl_usd ?? 0);
    const mae = Number(ctx.mae_usd ?? 0);
    const slip = Number(ctx.slip_cost_usd ?? 0);
    return pnl - 0.5 * mae - 0.25 * slip;
  }

  const samples = collectSamples(rows, which === 'fee' ? 'pFill' : 'reward', qhat);
  const overall = computeStats(samples);

  // Segmentation: source (migration vs raydium) and regime (calm vs congested)
  const execRows = db
    .prepare(`SELECT ts, time_to_land_ms AS ttl, priority_fee_lamports AS pri FROM exec_outcomes`)
    .all() as Array<{ ts: number; ttl: number | null; pri: number | null }>;
  const ttls = execRows.map((r) => r.ttl ?? 0).filter((v) => Number.isFinite(v));
  const priVals = execRows.map((r) => r.pri ?? 0).filter((v) => Number.isFinite(v));
  const ttlThresh = ttls.length ? quantileFloor(ttls, 0.75) : 0;
  const priThresh = priVals.length ? quantileFloor(priVals, 0.75) : 0;
  const fills = db
    .prepare(`SELECT mint, CAST(strftime('%s', created_at) AS INTEGER) * 1000 AS tsMs FROM fills ORDER BY tsMs`)
    .all() as Array<{ mint: string; tsMs: number }>;
  const migStmt = db.prepare(`SELECT 1 FROM migration_events WHERE mint = ? LIMIT 1`);

  function nearestExec(ts: number): { ttl: number; pri: number } | null {
    let best: any = null;
    let bestD = Infinity;
    for (const r of execRows) {
      const d = Math.abs(r.ts - ts);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best ? { ttl: (best.ttl ?? 0) as number, pri: (best.pri ?? 0) as number } : null;
  }
  function nearestMint(ts: number): string | undefined {
    let lo = 0;
    let hi = fills.length - 1;
    let bestMint: string | undefined = undefined;
    let bestDelta = Infinity;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const row = fills[mid];
      const delta = Math.abs(row.tsMs - ts);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestMint = row.mint;
      }
      if (row.tsMs < ts) lo = mid + 1;
      else hi = mid - 1;
    }
    return bestDelta <= 5000 ? bestMint : undefined;
  }

  const segmentSamples: Record<string, Sample[]> = {
    'source:migration': [],
    'source:raydium': [],
    'regime:calm': [],
    'regime:congested': []
  };
  for (const row of rows) {
    const sample = collectSamples([row], which === 'fee' ? 'pFill' : 'reward', qhat);
    if (sample.length === 0) continue;
    const ex = nearestExec(row.ts);
    if (ex) {
      const regime = ex.ttl > ttlThresh || ex.pri > priThresh ? 'regime:congested' : 'regime:calm';
      segmentSamples[regime].push(sample[0]);
    }
    const mint = nearestMint(row.ts);
    const src = mint && migStmt.get(mint) ? 'source:migration' : 'source:raydium';
    segmentSamples[src].push(sample[0]);
  }
  const segStats: Record<string, OpeStats> = {};
  for (const [seg, arr] of Object.entries(segmentSamples)) {
    segStats[seg] = computeStats(arr);
  }

  const thresholds = (gating as any)[which] ?? {};
  const minIps = thresholds.minIps ?? 0;
  const minWis = thresholds.minWis ?? 0;
  const minDr = thresholds.minDr ?? 0;
  const samplePass = overall.sampleCount >= (gating.sampleMin ?? 0);
  const essPass = overall.ess >= (gating.minEss ?? 0);
  const metricPass = overall.IPS >= minIps && overall.WIS >= minWis && overall.DR >= minDr;
  const overallPass = samplePass && essPass && metricPass;

  console.log(
    [
      `OPE ${which}`,
      `IPS=${overall.IPS.toFixed(4)}±${overall.ipsStderr.toFixed(4)}`,
      `WIS=${overall.WIS.toFixed(4)}±${overall.wisStderr.toFixed(4)}`,
      `DR=${overall.DR.toFixed(4)}±${overall.drStderr.toFixed(4)}`,
      `N=${overall.sampleCount}`,
      `ESS=${overall.ess.toFixed(1)}`,
      `PASS=${overallPass ? 'yes' : 'no'}`
    ].join(' | ')
  );

  for (const [seg, stats] of Object.entries(segStats)) {
    if (stats.sampleCount === 0) continue;
    console.log(
      [
        `  segment=${seg}`,
        `IPS=${stats.IPS.toFixed(4)}`,
        `WIS=${stats.WIS.toFixed(4)}`,
        `DR=${stats.DR.toFixed(4)}`,
        `N=${stats.sampleCount}`,
        `ESS=${stats.ess.toFixed(1)}`
      ].join(' | ')
    );
  }

  const { createBacktestRun, insertBacktestResult, finishBacktestRun } = await import('../../../packages/persistence/src/index');
  const runId = createBacktestRun({ from: argv.from, to: argv.to, policy: which }, 'ope');
  insertBacktestResult(runId, `OPE_IPS_${which}`, overall.IPS, 'overall');
  insertBacktestResult(runId, `OPE_WIS_${which}`, overall.WIS, 'overall');
  insertBacktestResult(runId, `OPE_DR_${which}`, overall.DR, 'overall');
  insertBacktestResult(runId, `OPE_SAMPLE_${which}`, overall.sampleCount, 'overall');
  insertBacktestResult(runId, `OPE_ESS_${which}`, overall.ess, 'overall');
  insertBacktestResult(runId, `OPE_GATE_${which}`, overallPass ? 1 : 0, 'overall');
  for (const [seg, stats] of Object.entries(segStats)) {
    insertBacktestResult(runId, `OPE_IPS_${which}`, stats.IPS, seg);
    insertBacktestResult(runId, `OPE_WIS_${which}`, stats.WIS, seg);
    insertBacktestResult(runId, `OPE_DR_${which}`, stats.DR, seg);
    insertBacktestResult(runId, `OPE_SAMPLE_${which}`, stats.sampleCount, seg);
    insertBacktestResult(runId, `OPE_ESS_${which}`, stats.ess, seg);
  }
  finishBacktestRun(runId);

  if (!overallPass) {
    console.error('Rollout gate failed: insufficient samples or metrics below thresholds.');
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

