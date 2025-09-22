import EventEmitter from 'eventemitter3';
import { PlanEnvelope } from './types';

export type PolicyEvents = {
  plan: (plan: PlanEnvelope) => void;
};

export class PolicyEventBus {
  private readonly emitter = new EventEmitter<PolicyEvents>();

  onPlan(listener: (plan: PlanEnvelope) => void): () => void {
    this.emitter.on('plan', listener);
    return () => this.emitter.off('plan', listener);
  }

  emitPlan(plan: PlanEnvelope): void {
    this.emitter.emit('plan', plan);
  }
}
