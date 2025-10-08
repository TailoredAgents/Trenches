import { SizeDecision, TokenCandidate } from '@trenches/shared';
import { loadConfig } from '@trenches/config';
import { insertSizingDecision, getNearestPrice } from '@trenches/persistence';

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

  const perNameFraction = Number.isFinite(ctx.caps.perNameFraction) ? ctx.caps.perNameFraction : cfg.wallet.perNameCapFraction ?? 1;
  const perNameFractionCap = Number.isFinite(perNameFraction) ? equity * perNameFraction : Infinity;
  const perNameMaxCap = Number.isFinite(ctx.caps.perNameMaxSol) ? ctx.caps.perNameMaxSol : cfg.wallet.perNameCapMaxSol ?? Infinity;
  const dailyCapTotal = Number.isFinite(ctx.caps.dailySpendCapSol) ? ctx.caps.dailySpendCapSol : Infinity;
  const dailyRemaining = Number.isFinite(dailyCapTotal) ? Math.max(0, dailyCapTotal - ctx.dailySpendUsed) : Infinity;

  const pricingTs = Date.now();
  const priceFromDb = getNearestPrice(pricingTs, 'SOL');
  const priceHint = Number(process.env.SOL_PRICE_HINT ?? NaN);
  const solPriceUsd = priceFromDb && priceFromDb > 0 ? priceFromDb : Number.isFinite(priceHint) && priceHint > 0 ? priceHint : undefined;
  const perMintCapUsd = typeof (cfg as any).sizing?.perMintCapUsd === 'number' ? (cfg as any).sizing.perMintCapUsd : undefined;
  const perMintCapFromUsd = solPriceUsd && perMintCapUsd ? perMintCapUsd / solPriceUsd : Infinity;

  const candidates: Array<{ arm: string; notional: number }> = arms.map((a: any) => {
    const armNotional = Math.max(0, equity * a.value);
    return { arm: `${a.type}:${a.value}`, notional: Math.min(walletFree, armNotional) };
  });
  let best = candidates[0];
  for (const c of candidates) {
    if (c.notional <= best.notional) continue;
    best = c;
  }

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
  const notional = Number(notionalRaw.toFixed(4));
  const limitingReason = limiting.reason ?? 'arm_cap';
  const riskNote =
    notional <= 0
      ? limitingReason === 'arm_cap'
        ? 'no_available_size'
        : limitingReason
      : limitingReason === 'arm_cap'
        ? 'ok'
        : limitingReason;

  const dec: SizeDecision = { ts, mint: ctx.candidate.mint, arm: best.arm, notional, riskNote };
  // Propensities (softmax over notional as a simple proxy)
  try {
    const scores = candidates.map((c) => c.notional);
    const max = Math.max(...scores);
    const exps = scores.map((s: number) => Math.exp((s - max) / Math.max(1e-6, max || 1)));
    const sum = exps.reduce((a: number, b: number) => a + b, 0) || 1;
    const probs = exps.map((e: number) => e / sum);
    const armIndex = candidates.findIndex((c: { arm: string; notional: number }) => c.arm === best.arm);
    const ctxHash = Math.abs(JSON.stringify({ ts, mint: ctx.candidate.mint }).split('').reduce((a: number, ch: string) => ((a << 5) - a + ch.charCodeAt(0)) | 0, 0));
    insertSizingDecision(dec, {
      ctx,
      armIndex,
      scores,
      probs,
      caps: {
        perNameFractionCap,
        perNameMaxCap,
        dailyCapRemaining: dailyRemaining,
        perMintCapFromUsd,
        walletFree
      },
      ctx_hash: ctxHash
    });
  } catch {
    insertSizingDecision(dec, { ctx });
  }
  return dec;
}
