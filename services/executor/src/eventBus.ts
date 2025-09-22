import EventEmitter from 'eventemitter3';
import { TradeEvent } from '@trenches/shared';

export type ExecutorEvents = {
  trade: (event: TradeEvent) => void;
};

export class ExecutorEventBus {
  private readonly emitter = new EventEmitter<ExecutorEvents>();

  onTrade(listener: (event: TradeEvent) => void): () => void {
    this.emitter.on('trade', listener);
    return () => this.emitter.off('trade', listener);
  }

  emitTrade(event: TradeEvent): void {
    this.emitter.emit('trade', event);
  }
}
