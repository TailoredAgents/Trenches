import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { loadBanditState, upsertBanditState, BanditStateRow } from '@trenches/persistence';
import { BanditAction, BanditSelection } from './types';

const logger = createLogger('policy-bandit');

export type BanditContext = number[];

const EPSILON_FLOOR = 0.02;

export class LinUCBBandit {
  private readonly actions: BanditAction[];
  private readonly alpha: number;
  private readonly dim: number;
  private readonly state: Map<string, { ainv: number[][]; b: number[] }> = new Map();

  constructor(featureDimension: number) {
    const config = loadConfig();
    this.actions = config.bandit.bundles.map((bundle) => ({
      id: bundle.id,
      gate: bundle.gate,
      slippageBps: bundle.slippageBps,
      tipPercentile: bundle.tipPercentile,
      sizeMultiplier: bundle.sizeMultiplier
    }));
    this.alpha = Math.sqrt(featureDimension);
    this.dim = featureDimension;
    this.bootstrapState(loadBanditState());
  }

  select(context: BanditContext): BanditSelection {
    const config = loadConfig();
    const epsilon = Math.max(config.bandit.epsilonFloor ?? EPSILON_FLOOR, EPSILON_FLOOR);
    if (Math.random() < epsilon) {
      const randomAction = this.actions[Math.floor(Math.random() * this.actions.length)];
      return { action: randomAction, expectedReward: 0, confidence: epsilon };
    }

    let best: BanditSelection | null = null;
    for (const action of this.actions) {
      const state = this.getState(action.id);
      const theta = multiplyMatrixVector(state.ainv, state.b);
      const exploit = dot(theta, context);
      const exploration = this.alpha * Math.sqrt(quadraticForm(state.ainv, context));
      const score = exploit + exploration;
      if (!best || score > best.expectedReward) {
        best = { action, expectedReward: score, confidence: exploitationConfidence(exploit, exploration) };
      }
    }
    return best!;
  }

  update(actionId: string, context: BanditContext, reward: number): void {
    const state = this.getState(actionId);
    const ainv = state.ainv;
    const b = state.b;

    const ainvX = multiplyMatrixVector(ainv, context);
    const denominator = 1 + dot(context, ainvX);
    const outer = outerProduct(ainvX, ainvX);
    const delta = scaleMatrix(outer, 1 / denominator);
    state.ainv = subtractMatrices(ainv, delta);

    for (let i = 0; i < b.length; i += 1) {
      b[i] += reward * context[i];
    }
    state.b = b;

    upsertBanditState({ actionId, ainv: state.ainv, b: state.b });
  }

  private bootstrapState(rows: BanditStateRow[]): void {
    for (const row of rows) {
      if (row.ainv.length === this.dim && row.b.length === this.dim) {
        this.state.set(row.actionId, { ainv: row.ainv, b: row.b });
      }
    }
    for (const action of this.actions) {
      if (!this.state.has(action.id)) {
        this.state.set(action.id, {
          ainv: identityMatrix(this.dim),
          b: new Array(this.dim).fill(0)
        });
      }
    }
  }

  private getState(actionId: string): { ainv: number[][]; b: number[] } {
    const existing = this.state.get(actionId);
    if (existing) {
      return existing;
    }
    const fresh = {
      ainv: identityMatrix(this.dim),
      b: new Array(this.dim).fill(0)
    };
    this.state.set(actionId, fresh);
    return fresh;
  }
}

function identityMatrix(size: number): number[][] {
  return Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))
  );
}

function multiplyMatrixVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function quadraticForm(matrix: number[][], vector: number[]): number {
  const mv = multiplyMatrixVector(matrix, vector);
  return dot(vector, mv);
}

function outerProduct(a: number[], b: number[]): number[][] {
  return a.map((valueA) => b.map((valueB) => valueA * valueB));
}

function scaleMatrix(matrix: number[][], scalar: number): number[][] {
  return matrix.map((row) => row.map((value) => value * scalar));
}

function subtractMatrices(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((value, j) => value - b[i][j]));
}

function exploitationConfidence(exploit: number, exploration: number): number {
  const denom = Math.abs(exploit) + Math.abs(exploration) + 1e-6;
  return Math.min(Math.abs(exploit) / denom, 1);
}
