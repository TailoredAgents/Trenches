import { HazardState } from '@trenches/shared';
import { insertHazardState } from '@trenches/persistence';
import { loadConfig } from '@trenches/config';
import { registerCounter, registerGauge } from '@trenches/metrics';

export type PositionSnapshot = {
  mint: string;
  avgPrice: number;
  highestPrice: number;
  lastPrice?: number;
};

const hazardAvg = registerGauge({ name: 'survival_hazard_avg', help: 'Average hazard over recent evaluations' });
const trailAvg = registerGauge({ name: 'survival_trail_bps_avg', help: 'Average computed trailing width (bps)' });
const forcedFlatten = registerCounter({ name: 'survival_forced_flatten_total', help: 'Total forced flatten events due to hazard panic' });

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

export function computeStops(state: PositionSnapshot, extras: {
  pnlPct: number;
  ageSec: number;
  spreadBps: number;
  volatilityBps: number;
  flowRatio: number;
  slipGapBps: number;
  rugProb?: number;
}): HazardState {
  const cfg = loadConfig();
  const ts = Date.now();
  const pnlPct = extras.pnlPct;
  const red = clamp01(-pnlPct / 0.08);
  const wide = clamp01(extras.spreadBps / 120);
  const choppy = clamp01(extras.volatilityBps / 180);
  const sellFlow = clamp01((1 - extras.flowRatio) / 0.6);
  const slipShock = clamp01(extras.slipGapBps / 80);
  const rug = clamp01(extras.rugProb ?? 0);
  const green = clamp01(pnlPct / 0.12);
  const buyFlow = clamp01((extras.flowRatio - 1) / 0.6);
  let z = 1.2*red + 0.9*wide + 1.0*choppy + 0.8*sellFlow + 0.7*slipShock + 0.6*rug - 0.9*green - 0.6*buyFlow;
  const hazard = clamp01(1 / (1 + Math.exp(-z)));
  const base = (cfg as any).survival?.baseTrailBps ?? 120;
  const minB = (cfg as any).survival?.minTrailBps ?? 60;
  const maxB = (cfg as any).survival?.maxTrailBps ?? 250;
  const trailBps = Math.max(minB, Math.min(maxB, Math.round(base * (1 - 0.6*hazard))));
  let ladderLevels: number[] = ((cfg as any).survival?.ladderLevels ?? [0.05, 0.12, 0.22]) as number[];
  if (hazard >= ((cfg as any).survival?.hazardTighten ?? 0.65)) {
    ladderLevels = ladderLevels.slice(0, Math.max(1, Math.floor(ladderLevels.length / 2)));
  }
  const ladder: [number, number][] = ladderLevels.map((lvl) => [lvl, 0.25]);
  try { hazardAvg.set(hazard); trailAvg.set(trailBps); } catch {}
  if (hazard >= ((cfg as any).survival?.hazardPanic ?? 0.85)) {
    forcedFlatten.inc();
  }
  const hs: HazardState = { ts, mint: state.mint, sellTrailBps: trailBps, ladder, hazard };
  try { insertHazardState({ ts, mint: state.mint, hazard, trailBps, ladder }); } catch {}
  return hs;
}
