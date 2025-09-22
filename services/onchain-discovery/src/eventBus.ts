import EventEmitter from 'eventemitter3';
import { TokenCandidate } from '@trenches/shared';
import { DiscoveryEvents, PoolInitEvent } from './types';

export class DiscoveryEventBus {
  private readonly emitter = new EventEmitter<DiscoveryEvents>();

  onPoolInit(listener: (event: PoolInitEvent) => void): () => void {
    this.emitter.on('pool_init', listener);
    return () => this.emitter.off('pool_init', listener);
  }

  onCandidate(listener: (candidate: TokenCandidate) => void): () => void {
    this.emitter.on('candidate', listener);
    return () => this.emitter.off('candidate', listener);
  }

  emitPoolInit(event: PoolInitEvent): void {
    this.emitter.emit('pool_init', event);
  }

  emitCandidate(candidate: TokenCandidate): void {
    this.emitter.emit('candidate', candidate);
  }
}
