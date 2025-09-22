import type { Counter, Gauge } from '@trenches/metrics';
import { registerCounter, registerGauge } from '@trenches/metrics';

export const safetyEvaluations: Counter<string> = registerCounter({
  name: 'safety_evaluations_total',
  help: 'Total candidates evaluated by safety engine'
});

export const safetyPasses: Counter<string> = registerCounter({
  name: 'safety_pass_total',
  help: 'Candidates that passed safety evaluation'
});

export const safetyBlocks: Counter<string> = registerCounter({
  name: 'safety_block_total',
  help: 'Candidates blocked by safety evaluation',
  labelNames: ['reason']
});

export const ocrsGauge: Gauge<string> = registerGauge({
  name: 'safety_last_ocrs',
  help: 'OCRS value of last evaluated candidate'
});

export const evaluationDuration: Gauge<string> = registerGauge({
  name: 'safety_evaluation_ms',
  help: 'Duration of last safety evaluation in milliseconds'
});