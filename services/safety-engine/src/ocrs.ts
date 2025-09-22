import { TokenCandidate } from '@trenches/shared';

const WEIGHTS = {
  buysSells: 0.23,
  unique: 0.18,
  lpDepth: 0.12,
  txVelocity: 0.1,
  holders: 0.07,
  ageInverse: 0.07,
  spreadInverse: 0.06,
  shortVol: 0.05,
  avgBuySize: 0.05,
  whale: 0.04,
  pumpDelay: 0.03
} as const;

export type OcrsInput = {
  candidate: TokenCandidate;
  whaleFlag: boolean;
  holdersScore?: number;
  shortVolScore?: number;
  avgBuySizeScore?: number;
  pumpDelayScore?: number;
};

export function computeOcrs(input: OcrsInput): { score: number; features: Record<string, number> } {
  const { candidate, whaleFlag } = input;
  const features: Record<string, number> = {};

  const totalVolume = candidate.buys60 + candidate.sells60;
  features.buysSells = normalize(totalVolume, 40);
  features.unique = normalize(candidate.uniques60, 20);
  features.lpDepth = clamp(candidate.lpSol / 40, 0, 1);
  features.txVelocity = normalize(totalVolume, 50);
  features.holders = input.holdersScore ?? 0.5;
  features.ageInverse = clamp(1 - candidate.ageSec / 600, 0, 1);
  features.spreadInverse = clamp(1 - candidate.spreadBps / 150, 0, 1);
  features.shortVol = input.shortVolScore ?? 0.5;
  features.avgBuySize = input.avgBuySizeScore ?? 0.5;
  features.whale = whaleFlag ? 1 : 0;
  features.pumpDelay = input.pumpDelayScore ?? 0.5;

  const weighted = Object.entries(WEIGHTS).reduce((acc, [key, weight]) => {
    const value = features[key] ?? 0;
    return acc + weight * value;
  }, 0);

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const score = weighted / totalWeight;

  return { score, features };
}

function normalize(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp(value / target, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
