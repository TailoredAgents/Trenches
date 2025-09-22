import { SocialPost } from '@trenches/shared';

export type PostEmitter = {
  emit: (event: 'post', payload: SocialPost) => void;
};

export interface SocialSource {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): SourceStatus;
}

export type SourceStatus = {
  state: 'idle' | 'running' | 'backing_off' | 'error';
  detail?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  lastEventTs?: number;
};

export type SourceFactory = (deps: SourceDependencies) => SocialSource;

export type SourceDependencies = {
  emitter: PostEmitter;
  onStatus: (name: string, status: SourceStatus) => void;
};
