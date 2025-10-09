import { loadConfig } from '@trenches/config';
import { CongestionLevel } from '@trenches/shared';

const DEFAULT_RANGES: Record<CongestionLevel, [number, number]> = {
  p25: [200_000, 400_000],
  p50: [500_000, 1_000_000],
  p75: [1_500_000, 2_500_000],
  p90: [3_000_000, 4_000_000]
};

export function pickTipLamports(level: CongestionLevel): number {
  const cfg = loadConfig();
  const tipAccountConfigured = typeof cfg.rpc?.jitoTipAccount === 'string' && cfg.rpc.jitoTipAccount.length > 0;
  const jitoEnabled = Boolean(cfg.execution?.jitoEnabled && tipAccountConfigured);
  if (!jitoEnabled) {
    return 0;
  }
  const ranges = (cfg.execution as any)?.tipRanges ?? DEFAULT_RANGES;
  const range = ranges[level] ?? DEFAULT_RANGES[level];
  const lo = Array.isArray(range) ? Number(range[0]) : DEFAULT_RANGES[level][0];
  const hi = Array.isArray(range) ? Number(range[1]) : DEFAULT_RANGES[level][1];
  const min = Number.isFinite(lo) ? Math.max(0, lo) : DEFAULT_RANGES[level][0];
  const max = Number.isFinite(hi) ? Math.max(min + 1, hi) : DEFAULT_RANGES[level][1];
  return Math.floor(min + Math.random() * Math.max(1, max - min));
}
