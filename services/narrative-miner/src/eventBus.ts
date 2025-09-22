import { EventEmitter } from 'events';
import { TopicEvent, TokenCandidate } from '@trenches/shared';

type NarrativeEvents = {
  topic: (event: TopicEvent) => void;
  candidate: (candidate: TokenCandidate) => void;
};

export class NarrativeEventBus {
  private readonly emitter = new EventEmitter({ captureRejections: false });

  onTopic(listener: NarrativeEvents['topic']): () => void {
    this.emitter.on('topic', listener);
    return () => this.emitter.off('topic', listener);
  }

  onCandidate(listener: NarrativeEvents['candidate']): () => void {
    this.emitter.on('candidate', listener);
    return () => this.emitter.off('candidate', listener);
  }

  emitTopic(event: TopicEvent): void {
    this.emitter.emit('topic', event);
  }

  emitCandidate(candidate: TokenCandidate): void {
    this.emitter.emit('candidate', candidate);
  }
}
