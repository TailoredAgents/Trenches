import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseSize, type SizingContext } from './sizing_constrained';
import { loadConfig } from '@trenches/config';

vi.mock('@trenches/config', () => ({
  loadConfig: vi.fn()
}));

vi.mock('@trenches/persistence', () => ({
  insertSizingDecision: vi.fn(),
  getNearestPrice: vi.fn(() => null)
}));

const metricMocks = vi.hoisted(() => ({
  sizingCapLimitTotal: { inc: vi.fn() },
  sizingRiskScaledTotal: { inc: vi.fn() },
  sizingRiskMultiplierGauge: { set: vi.fn() },
  sizingSolPriceSourceTotal: { inc: vi.fn() }
}));

vi.mock('./metrics', () => metricMocks);

const defaultConfig = {
  sizing: { arms: [{ type: 'equity_frac', value: 0.5 }] },
  wallet: {
    perNameCapFraction: 1,
    perNameCapMaxSol: 10,
    lpImpactCapFraction: 1,
    flowCapFraction: 1,
    flowTradesPer5m: 60,
    flowCapMinSol: 0
  }
} as unknown as ReturnType<typeof loadConfig>;

const baseCtx = (): SizingContext => ({
  candidate: {
    t: 'token_candidate',
    mint: 'mint',
    name: 'Token',
    symbol: 'TOK',
    source: 'raydium',
    ageSec: 60,
    lpSol: 5,
    buys60: 30,
    sells60: 30,
    uniques60: 20,
    spreadBps: 100,
    safety: { ok: true, reasons: [] as string[] }
  },
  walletEquity: 10,
  walletFree: 10,
  dailySpendUsed: 0,
  caps: { perNameFraction: 1, perNameMaxSol: 10, dailySpendCapSol: 10 }
});

describe('chooseSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockReturnValue(defaultConfig);
    Object.values(metricMocks).forEach((mock) => {
      if ('inc' in mock && typeof mock.inc === 'function') {
        mock.inc.mockClear();
      }
      if ('set' in mock && typeof mock.set === 'function') {
        mock.set.mockClear();
      }
    });
  });

  it('falls back when SOL price is missing', () => {
    const ctx = baseCtx();
    const result = chooseSize({ ...ctx });
    expect(result.notional).toBeGreaterThanOrEqual(0);
    expect(metricMocks.sizingSolPriceSourceTotal.inc).toHaveBeenCalledWith({ source: 'missing' });
  });

  it('reduces notional and records risk metrics for risk signals', () => {
    const ctx = baseCtx();
    const result = chooseSize({ ...ctx, rugProb: 0.9, pFill: 0.1, expSlipBps: 500 });
    expect(result.notional).toBeLessThan(5);
    expect(result.riskNote).toBe('risk_scaled');
    expect(metricMocks.sizingRiskMultiplierGauge.set).toHaveBeenCalled();
    expect(metricMocks.sizingRiskScaledTotal.inc).toHaveBeenCalledWith({ factor: 'rugProb' });
    expect(metricMocks.sizingRiskScaledTotal.inc).toHaveBeenCalledWith({ factor: 'pFill' });
    expect(metricMocks.sizingRiskScaledTotal.inc).toHaveBeenCalledWith({ factor: 'expSlipBps' });
  });

  it('applies combined risk multiplier deterministically', () => {
    const ctx = baseCtx();
    const result = chooseSize({ ...ctx, rugProb: 0.9, pFill: 0.1, expSlipBps: 5_000 });
    const expectedBase = 5;
    const expectedMultiplier = Number((0.28 * 0.25 * 0.2).toFixed(4));
    const expectedNotional = Number((expectedBase * expectedMultiplier).toFixed(4));
    expect(result.notional).toBe(expectedNotional);
    expect(result.riskNote === 'risk_scaled' || result.riskNote === 'risk_scaled_zero').toBeTruthy();
    expect(metricMocks.sizingCapLimitTotal.inc).toHaveBeenCalled();
  });
});
