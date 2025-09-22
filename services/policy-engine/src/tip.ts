import { CongestionLevel } from '@trenches/shared';

export function pickTipLamports(level: CongestionLevel): number {
  const ranges: Record<CongestionLevel, [number, number]> = {
    p25: [200_000, 400_000],
    p50: [500_000, 1_000_000],
    p75: [1_500_000, 2_500_000],
    p90: [3_000_000, 4_000_000]
  };
  const [lo, hi] = ranges[level];
  return Math.floor(lo + Math.random() * (hi - lo));
}
