import { FeeDecision } from '@trenches/shared';
import { insertFeeDecision } from '@trenches/persistence';
import { loadConfig } from '@trenches/config';

export type FeeContext = {
  congestionScore?: number; // 0..1, 1 = low congestion
  sizeSol: number;
  equity: number;
  lpSol?: number;
  spreadBps?: number;
  volatilityBps?: number;
  landedRate?: number;
};

type Arm = { cuPrice: number; slippageBps: number };

type ArmState = { A: number[][]; b: number[]; count: number };

const state: { [key: string]: ArmState } = {};

function zeros(n: number): number[] { return Array.from({ length: n }, () => 0); }
function eye(n: number): number[][] { const m = Array.from({ length: n }, (_, i) => zeros(n)); for (let i = 0; i < n; i++) m[i][i] = 1; return m; }
function dot(a: number[], b: number[]): number { return a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0); }
function matVec(A: number[][], x: number[]): number[] { return A.map((row) => dot(row, x)); }
function addVec(a: number[], b: number[]): number[] { return a.map((v, i) => v + (b[i] ?? 0)); }
function addMat(A: number[][], B: number[][]): number[][] { return A.map((row, i) => row.map((v, j) => v + (B[i]?.[j] ?? 0))); }
function outer(x: number[], y: number[]): number[][] { return x.map((xi) => y.map((yj) => xi * yj)); }

function getArms(): Arm[] {
  const cfg = loadConfig();
  return (cfg.execution as any).feeArms ?? [];
}

function toContextVector(ctx: FeeContext): number[] {
  return [
    1,
    Math.min(1, (ctx.congestionScore ?? 0.5)),
    Math.min(1, (ctx.lpSol ?? 0) / 50),
    1 - Math.min(1, (ctx.spreadBps ?? 0) / 200),
    1 - Math.min(1, (ctx.volatilityBps ?? 0) / 300),
    Math.min(1, ctx.sizeSol / Math.max(0.01, ctx.equity))
  ];
}

export function selectArm(ctx: FeeContext, eligible: Arm[], uw: number): { arm: Arm; idx: number; score: number } {
  const x = toContextVector(ctx);
  const d = x.length;
  if (!state['global']) state['global'] = { A: eye(d), b: zeros(d), count: 0 };
  const s = state['global'];
  // A^{-1} approx via identity (small-scale LinUCB with optimism)
  const theta = s.b.slice(); // naive
  let best = { arm: eligible[0], idx: 0, score: -Infinity };
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    const armFeat = [x[0], x[1], x[2], x[3], x[4], x[5], Math.min(1, a.cuPrice / 10000), Math.min(1, a.slippageBps / 300)];
    const mean = dot(theta, armFeat.slice(0, theta.length));
    const ucb = uw * Math.sqrt(armFeat.reduce((acc, v) => acc + v * v, 0));
    const sc = mean + ucb;
    if (sc > best.score) best = { arm: a, idx: i, score: sc };
  }
  return best;
}

export function updateArm(ctx: FeeContext, arm: Arm, outcome: { filled: boolean; realizedSlipBps: number; feeBps: number }): void {
  const x = toContextVector(ctx);
  const feat = [x[0], x[1], x[2], x[3], x[4], x[5], Math.min(1, arm.cuPrice / 10000), Math.min(1, arm.slippageBps / 300)];
  const reward = (Math.max(0, 120 - outcome.realizedSlipBps - outcome.feeBps)) * (outcome.filled ? 1 : -0.5);
  const d = feat.length;
  if (!state['global']) state['global'] = { A: eye(d), b: zeros(d), count: 0 };
  const s = state['global'];
  s.A = addMat(s.A, outer(feat, feat));
  s.b = addVec(s.b, feat.map((v) => v * reward));
  s.count += 1;
}

export function decideFees(ctx: FeeContext): FeeDecision {
  const ts = Date.now();
  const arms = getArms();
  const pick = selectArm(ctx, arms, 0.2);
  const cuLimit = 1_200_000 + Math.floor(Math.min(800_000, ctx.sizeSol * 50_000));
  const dec: FeeDecision = { ts, cuPrice: pick.arm.cuPrice, cuLimit, slippageBps: pick.arm.slippageBps, rationale: 'linucb' };
  // Propensity logging for OPE
  try {
    const x = toContextVector(ctx);
    const theta = (state['global']?.b ?? zeros(x.length)).slice();
    const scores: number[] = [];
    for (const a of arms) {
      const feat = [x[0], x[1], x[2], x[3], x[4], x[5], Math.min(1, a.cuPrice / 10000), Math.min(1, a.slippageBps / 300)];
      scores.push(dot(theta, feat.slice(0, theta.length)));
    }
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0) || 1;
    const probs = exps.map((e) => e / sum);
    const ctxHash = Math.abs(JSON.stringify({ x, ts }).split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
    insertFeeDecision(dec, { ctx, arms, armIndex: arms.findIndex((a) => a.cuPrice === pick.arm.cuPrice && a.slippageBps === pick.arm.slippageBps), scores, probs, ctx_hash: ctxHash });
  } catch { insertFeeDecision(dec, { ctx, arms }); }
  return dec;
}
