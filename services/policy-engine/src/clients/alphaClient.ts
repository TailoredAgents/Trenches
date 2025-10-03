import EventSource from 'eventsource';
import { createLogger } from '@trenches/logger';
import { createInMemoryLastEventIdStore, subscribeJsonStream } from '@trenches/util';

type Horizon = '10m' | '60m' | '24h';

type ScoreEvent = { ts: number; mint: string; horizon: Horizon; score: number };

export type AlphaClientOptions = {
  baseUrl?: string | null;
  horizons?: Horizon[];
  maxEntries?: number;
};

export type AlphaClient = {
  getLatestScore: (mint: string, horizon: Horizon) => number | undefined;
  dispose: () => void;
  size: () => number;
};

const DEFAULT_MAX_ENTRIES = 512;

export function createAlphaClient(options: AlphaClientOptions): AlphaClient {
  const logger = createLogger('policy.alpha-client');
  const baseUrl = options.baseUrl ?? null;
  const horizons = new Set<Horizon>((options.horizons ?? ['10m', '60m', '24h']) as Horizon[]);
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const cache = new Map<string, { score: number; ts: number }>();

  let subscription: { dispose(): void } | null = null;

  const remember = (mint: string, horizon: Horizon, score: number, ts: number) => {
    const key = `${mint}:${horizon}`;
    if (cache.has(key)) {
      cache.delete(key);
    }
    cache.set(key, { score, ts });
    if (cache.size > maxEntries) {
      const first = cache.keys().next();
      if (!first.done) {
        cache.delete(first.value);
      }
    }
  };

  if (baseUrl) {
    const store = createInMemoryLastEventIdStore();
    subscription = subscribeJsonStream<ScoreEvent>(baseUrl, {
      lastEventIdStore: store,
      eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
      onOpen: () => {
        logger.info({ baseUrl }, 'alpha client connected');
      },
      onError: (err, attempt) => {
        logger.warn({ err, attempt }, 'alpha client stream error');
      },
      onParseError: (err) => {
        logger.error({ err }, 'alpha client parse error');
      },
      onMessage: (payload) => {
        if (!payload || typeof payload.mint !== 'string' || typeof payload.score !== 'number') {
          return;
        }
        const horizon = payload.horizon as Horizon;
        if (!horizons.has(horizon)) {
          return;
        }
        const ts = typeof payload.ts === 'number' ? payload.ts : Date.now();
        remember(payload.mint, horizon, payload.score, ts);
      }
    });
  } else {
    logger.warn('alpha client disabled: no baseUrl provided');
  }

  const getLatestScore = (mint: string, horizon: Horizon): number | undefined => {
    const entry = cache.get(`${mint}:${horizon}`);
    return entry?.score;
  };

  const dispose = () => {
    subscription?.dispose();
    subscription = null;
    cache.clear();
  };

  return {
    getLatestScore,
    dispose,
    size: () => cache.size
  };
}
