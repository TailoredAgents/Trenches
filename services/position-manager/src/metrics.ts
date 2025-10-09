import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const positionsOpened: Counter<string> = registerCounter({
  name: 'positions_opened_total',
  help: 'Number of positions opened'
});

export const positionsClosed: Counter<string> = registerCounter({
  name: 'positions_closed_total',
  help: 'Number of positions closed'
});

export const exitsTriggered: Counter<string> = registerCounter({
  name: 'position_exits_total',
  help: 'Number of automated exits triggered',
  labelNames: ['reason']
});

export const trailingActivations: Counter<string> = registerCounter({
  name: 'position_trailing_activated_total',
  help: 'Number of positions where trailing stop activated'
});

export const positionSizeGauge: Gauge<string> = registerGauge({
  name: 'position_manager_total_size_sol',
  help: 'Total SOL exposure managed'
});

export const maeAvgBpsGauge: Gauge<string> = registerGauge({
  name: 'position_manager_mae_avg_bps',
  help: 'Average maximum adverse excursion (bps) across open positions'
});

export const maeMaxBpsGauge: Gauge<string> = registerGauge({
  name: 'position_manager_mae_max_bps',
  help: 'Maximum MAE (bps) among open positions'
});
