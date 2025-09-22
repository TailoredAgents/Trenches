import EventEmitter from 'eventemitter3';
import { TokenCandidate } from '@trenches/shared';

export type SafetyEvents = {
  safe: (candidate: TokenCandidate) => void;
  blocked: (payload: { candidate: TokenCandidate; reasons: string[] }) => void;
};

export class SafetyEventBus {
  private readonly emitter = new EventEmitter<SafetyEvents>();

  onSafe(listener: (candidate: TokenCandidate) => void): () => void {
    this.emitter.on('safe', listener);
    return () => this.emitter.off('safe', listener);
  }

  onBlocked(listener: (payload: { candidate: TokenCandidate; reasons: string[] }) => void): () => void {
    this.emitter.on('blocked', listener);
    return () => this.emitter.off('blocked', listener);
  }

  emitSafe(candidate: TokenCandidate): void {
    this.emitter.emit('safe', candidate);
  }

  emitBlocked(payload: { candidate: TokenCandidate; reasons: string[] }): void {
    this.emitter.emit('blocked', payload);
  }
}
