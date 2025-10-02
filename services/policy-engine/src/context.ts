import { TokenCandidate } from '@trenches/shared';
import { BanditContext } from './bandit';

export function buildContext(candidate: TokenCandidate, extras: {
  congestionScore: number;
  walletEquity: number;
}): BanditContext {
  const age = candidate.ageSec;
  const lpSol = candidate.lpSol;
  const buys = candidate.buys60;
  const sells = candidate.sells60;
  const uniques = candidate.uniques60;
  const spread = candidate.spreadBps;
  const flow = buys + sells;

  const features = [
    normalize(age, 600, true),
    normalize(lpSol, 120),
    normalize(flow, 200),
    normalize(uniques, 40),
    normalize(spread, 200, true),    extras.congestionScore,
    normalize(extras.walletEquity, 200)
  ];
  return features;
}

function normalize(value: number, scale: number, invert = false): number {
  if (scale <= 0) {
    return 0;
  }
  const v = Math.max(Math.min(value / scale, 1), 0);
  return invert ? 1 - v : v;
}
