import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSizing } from './sizing';
import { loadConfig } from '@trenches/config';
import { recordSizingDecision } from '@trenches/persistence';

vi.mock('@trenches/config', () => ({
  loadConfig: vi.fn()
}));

vi.mock('@trenches/persistence', () => ({
  recordSizingDecision: vi.fn()
}));

const baseConfig = {
  wallet: {
    equityTiers: [{ minEquity: 0, maxEquity: null, riskFraction: 0.5 }],
    concurrencyCap: 10,
    concurrencyScaler: { base: 1, max: 1, recoveryMinutes: 60 },
    perNameCapFraction: 1,
    perNameCapMaxSol: null,
    lpImpactCapFraction: 1,
    flowCapFraction: 1,
    flowTradesPer5m: 60,
    flowCapMinSol: 0,
    dailySpendCapPct: undefined,
    dailySpendCapSol: undefined,
    reservesSol: 0
  }
} as unknown as ReturnType<typeof loadConfig>;

const defaultCandidate = {
  t: 'token_candidate',
  mint: 'mint',
  name: 'Token',
  symbol: 'TOK',
  source: 'raydium',
  ageSec: 60,
  lpSol: 10,
  buys60: 0,
  sells60: 0,
  uniques60: 10,
  spreadBps: 50,
  safety: { ok: true, reasons: [] as string[] }
} as const;

const walletSnapshot = {
  equity: 10,
  free: 10,
  reserves: 0,
  openPositions: 0,
  spendUsed: 0,
  spendRemaining: 10
};

describe('computeSizing flow cap behaviour', () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue(baseConfig);
    vi.mocked(recordSizingDecision).mockClear();
  });

  it('zeros size when recent flow is absent', () => {
    const candidate = { ...defaultCandidate, buys60: 0, sells60: 0 };
    const result = computeSizing(candidate, walletSnapshot, 1);
    expect(result.size).toBe(0);
  });

  it('allows sizing when flow meets reference volume', () => {
    const candidate = { ...defaultCandidate, buys60: 120, sells60: 120 };
    const result = computeSizing(candidate, walletSnapshot, 1);
    expect(result.size).toBeCloseTo(5, 5);
  });
});
