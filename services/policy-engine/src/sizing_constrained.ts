import { SizeDecision, TokenCandidate } from '@trenches/shared';
import { loadConfig } from '@trenches/config';
import { insertSizingDecision, getNearestPrice } from '@trenches/persistence';
import { sizingCapLimitTotal, sizingRiskMultiplierGauge, sizingRiskScaledTotal, sizingSolPriceSourceTotal } from './metrics';

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
  const walletFree = Math.max(0, ctx.walletFree);
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const perNameFraction = Number.isFinite(ctx.caps.perNameFraction) ? ctx.caps.perNameFraction : cfg.wallet.perNameCapFraction ?? 1;
  const perNameFractionCap = Number.isFinite(perNameFraction) ? equity * perNameFraction : Infinity;
  const perNameMaxCap = Number.isFinite(ctx.caps.perNameMaxSol) ? ctx.caps.perNameMaxSol : cfg.wallet.perNameCapMaxSol ?? Infinity;
  const dailyCapTotal = Number.isFinite(ctx.caps.dailySpendCapSol) ? ctx.caps.dailySpendCapSol : Infinity;
  const dailyRemaining = Number.isFinite(dailyCapTotal) ? Math.max(0, dailyCapTotal - ctx.dailySpendUsed) : Infinity;

  const pricingTs = Date.now();
  const priceFromDb = getNearestPrice(pricingTs, 'SOL');
  const priceHint = Number(process.env.SOL_PRICE_HINT ?? NaN);
  let solPriceSource: 'db' | 'hint' | 'missing' = 'missing';
  let solPriceUsd: number | undefined;
  if (priceFromDb && priceFromDb > 0) {
    solPriceUsd = priceFromDb;
    solPriceSource = 'db';
  } else if (Number.isFinite(priceHint) && priceHint > 0) {
    solPriceUsd = Number(priceHint);
    solPriceSource = 'hint';
  }
  sizingSolPriceSourceTotal.inc({ source: solPriceSource });
  const perMintCapUsd = typeof (cfg as any).sizing?.perMintCapUsd === 'number' ? (cfg as any).sizing.perMintCapUsd : undefined;

  const candidates: Array<{ arm: string; notional: number }> = arms.map((a: any) => {
    const armNotional = Math.max(0, equity * a.value);
    return { arm: `${a.type}:${a.value}`, notional: Math.min(walletFree, armNotional) };
  });
  let best = candidates[0];
  for (const c of candidates) {
    if (c.notional <= best.notional) continue;
    best = c;
  }
  if (!best) {
    best = { arm: 'unknown', notional: 0 };
  }

  const usdCapActive = Boolean(perMintCapUsd && perMintCapUsd > 0 && solPriceUsd && solPriceUsd > 0);
  const perMintCapFromUsd = usdCapActive && solPriceUsd && perMintCapUsd ? perMintCapUsd / solPriceUsd : Infinity;

  const capCandidates = [
    { reason: 'arm_cap', value: best.notional },
    { reason: 'wallet_free', value: walletFree },
    { reason: 'per_name_max', value: perNameMaxCap },
    { reason: 'per_name_fraction', value: perNameFractionCap },
    { reason: 'daily_cap', value: dailyRemaining },
    { reason: 'usd_cap', value: perMintCapFromUsd }
  ].filter((item) => Number.isFinite(item.value) && item.value >= 0);

  const capValues = capCandidates.length > 0 ? capCandidates.map((c) => c.value) : [Math.max(0, best.notional)];
  const notionalRaw = Math.max(0, Math.min(...capValues));
  const limiting = capCandidates.reduce(
    (acc, item) => (item.value < acc.value ? item : acc),
    capCandidates.length > 0 ? capCandidates[0] : { reason: 'arm_cap', value: notionalRaw }
  );
  let notional = Number(notionalRaw.toFixed(4));
  const limitingReason = limiting.reason ?? 'arm_cap';
  sizingCapLimitTotal.inc({ cap: limitingReason });
  let riskNote =
    notional <= 0
      ? limitingReason === 'arm_cap'
        ? 'no_available_size'
        : limitingReason
      : limitingReason === 'arm_cap'
        ? 'ok'
        : limitingReason;
  if (riskNote === 'ok' && perMintCapUsd && perMintCapUsd > 0 && !usdCapActive) {
    riskNote = 'usd_cap_suspended';
  }

  let riskMultiplier = 1;
  const riskFactors: Record<string, number> = {};
  if (typeof ctx.rugProb === 'number' && Number.isFinite(ctx.rugProb)) {
    const rug = clamp01(ctx.rugProb);
    const scale = clamp(1 - 0.8 * rug, 0.2, 1);
    riskMultiplier *= scale;
    if (scale < 0.999) {
      riskFactors.rugProb = rug;
    }
  }
  if (typeof ctx.pFill === 'number' && Number.isFinite(ctx.pFill)) {
    const pf = clamp01(ctx.pFill);
    const scale = clamp(pf / 0.9, 0.25, 1);
    riskMultiplier *= scale;
    if (scale < 0.999) {
      riskFactors.pFill = pf;
    }
  }
  if (typeof ctx.expSlipBps === 'number' && Number.isFinite(ctx.expSlipBps) && ctx.expSlipBps > 0) {
    const slip = clamp(ctx.expSlipBps, 1, 5_000);
    const scale = slip <= 150 ? 1 : clamp(150 / slip, 0.2, 1);
    riskMultiplier *= scale;
    if (scale < 0.999) {
      riskFactors.expSlipBps = slip;
    }
  }
  riskMultiplier = clamp(riskMultiplier, 0, 1);

  sizingRiskMultiplierGauge.set(riskMultiplier);
  if (riskMultiplier < 0.999) {
    const adjusted = Number(Math.max(0, notional * riskMultiplier).toFixed(4));
    notional = adjusted;
    if (notional <= 0) {
      riskNote = 'risk_scaled_zero';
    } else if (riskNote === 'ok' || riskNote === 'usd_cap_suspended') {
      riskNote = 'risk_scaled';
    }
    for (const factor of Object.keys(riskFactors)) {
      sizingRiskScaledTotal.inc({ factor });
    }
  }

  const perMintCapSnapshot = usdCapActive && Number.isFinite(perMintCapFromUsd) ? perMintCapFromUsd : 0;

  const capsSnapshot = {
    perNameFractionCap,
    perNameMaxCap,
    dailyCapRemaining: dailyRemaining,
    perMintCapFromUsd: perMintCapSnapshot,
    walletFree
  };
  const dec: SizeDecision = { ts, mint: ctx.candidate.mint, arm: best.arm, notional, riskNote };
  const persistencePayload = {
    ts,
    mint: ctx.candidate.mint,
    arm: best.arm,
    notional,
    finalSize: notional,
    reason: riskNote,
    equity,
    free: walletFree,
    tier: 'constrained',
    caps: capsSnapshot
  };
  // Propensities (softmax over notional as a simple proxy)
  const baseCtx = { ctx, riskMultiplier, riskFactors, sol_price_source: solPriceSource, usd_cap_active: usdCapActive };
  try {
    const scores = candidates.map((c) => c.notional);
    const max = Math.max(...scores);
    const exps = scores.map((s: number) => Math.exp((s - max) / Math.max(1e-6, max || 1)));
    const sum = exps.reduce((a: number, b: number) => a + b, 0) || 1;
    const probs = exps.map((e: number) => e / sum);
    const armIndex = candidates.findIndex((c: { arm: string; notional: number }) => c.arm === best.arm);
    const ctxHash = Math.abs(JSON.stringify({ ts, mint: ctx.candidate.mint }).split('').reduce((a: number, ch: string) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 0));
    insertSizingDecision(persistencePayload, {
      ctx,
      armIndex,
      scores,
      probs,
      caps: capsSnapshot,
      ctx_hash: ctxHash,
      sol_price_source: solPriceSource,
      usd_cap_active: usdCapActive,
      risk_multiplier: riskMultiplier,
      risk_factors: riskFactors
    });
  } catch {
    insertSizingDecision(persistencePayload, baseCtx);
  }
  return dec;
}
