import EventEmitter from 'eventemitter3';
import { SocialPost } from '@trenches/shared';

export type SocialEvents = {
  post: (payload: SocialPost) => void;
};

export class SocialEventBus {
  private readonly emitter = new EventEmitter<SocialEvents>();

  on(event: 'post', listener: (payload: SocialPost) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  emitPost(post: SocialPost): void {
    this.emitter.emit('post', post);
  }
}
