import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const plansEmitted: Counter<string> = registerCounter({
  name: 'policy_plans_emitted_total',
  help: 'Number of order plans emitted by policy engine'
});

export const plansSuppressed: Counter<string> = registerCounter({
  name: 'policy_plans_suppressed_total',
  help: 'Candidates skipped due to caps or gates',
  labelNames: ['reason']
});

export const sizingDurationMs: Gauge<string> = registerGauge({
  name: 'policy_sizing_duration_ms',
  help: 'Duration of last sizing computation'
});

export const walletEquityGauge: Gauge<string> = registerGauge({
  name: 'policy_wallet_equity_sol',
  help: 'Wallet total equity in SOL'
});

export const walletFreeGauge: Gauge<string> = registerGauge({
  name: 'policy_wallet_free_sol',
  help: 'Wallet free equity in SOL'
});

export const banditRewardGauge: Gauge<string> = registerGauge({
  name: 'policy_bandit_last_reward',
  help: 'Latest reward fed back to bandit'
});