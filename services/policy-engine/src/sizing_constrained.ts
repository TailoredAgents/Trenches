import { SizeDecision, TokenCandidate } from '@trenches/shared';
import { loadConfig } from '@trenches/config';
import { insertSizingDecision } from '@trenches/persistence';

export type SizingContext = {
  candidate: TokenCandidate;
  walletEquity: number;
  walletFree: number;
  dailySpendUsed: number;
  caps: { perNameFraction: number; perNameMaxSol: number; dailySpendCapSol: number };
};

export function chooseSize(ctx: SizingContext & { rugProb?: number; pFill?: number; expSlipBps?: number }): SizeDecision {
  const ts = Date.now();
  const cfg = loadConfig();
  const arms = (cfg as any).sizing?.arms ?? [{ type: 'equity_frac', value: 0.005 }];
  const equity = ctx.walletEquity;
  const perMintCapSol = Math.min(ctx.caps.perNameMaxSol ?? Infinity, (cfg as any).sizing?.perMintCapUsd ?? Infinity);
  const dailyCapSol = (cfg as any).sizing?.dailyLossCapUsd ?? Infinity;
  const coolOffL = (cfg as any).sizing?.coolOffL ?? 2;
  const candidates: Array<{ arm: string; notional: number }> = arms.map((a: any) => ({ arm: `${a.type}:${a.value}`, notional: Math.max(0, Math.min(ctx.walletFree, equity * a.value)) }));
  let best = candidates[0];
  for (const c of candidates) {
    if (c.notional <= best.notional) continue;
    best = c;
  }
  // Constraints
  const notional = Math.max(0, Math.min(best.notional, perMintCapSol, ctx.walletFree));
  const dec: SizeDecision = { ts, mint: ctx.candidate.mint, arm: best.arm, notional: Number(notional.toFixed(4)), riskNote: 'ok' };
  // Propensities (softmax over notional as a simple proxy)
  try {
    const scores = candidates.map((c) => c.notional);
    const max = Math.max(...scores);
    const exps = scores.map((s: number) => Math.exp((s - max) / Math.max(1e-6, max || 1)));
    const sum = exps.reduce((a: number, b: number) => a + b, 0) || 1;
    const probs = exps.map((e: number) => e / sum);
    const armIndex = candidates.findIndex((c: { arm: string; notional: number }) => c.arm === best.arm);
    const ctxHash = Math.abs(JSON.stringify({ ts, mint: ctx.candidate.mint }).split('').reduce((a: number, ch: string) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 0));
    insertSizingDecision(dec, { ctx, armIndex, scores, probs, ctx_hash: ctxHash });
  } catch { insertSizingDecision(dec, { ctx }); }
  return dec;
}
