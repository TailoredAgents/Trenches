import EventSource from 'eventsource';
import { createLogger } from '@trenches/logger';
import { createInMemoryLastEventIdStore, subscribeJsonStream } from '@trenches/util';

type Horizon = '10m' | '60m' | '24h';

type ScoreEvent = { ts: number; mint: string; horizon: Horizon; score: number };

type AlphaScoreEntry = { score: number; ts: number };

export type AlphaClientOptions = {
  baseUrl?: string | null;
  horizons?: Horizon[];
  maxEntries?: number;
  maxAgeMs?: number;
};

export type AlphaClient = {
  getLatestScore: (mint: string, horizon: Horizon) => AlphaScoreEntry | undefined;
  dispose: () => void;
  size: () => number;
};

const DEFAULT_MAX_ENTRIES = 512;
const DEFAULT_MAX_AGE_MS = 5 * 60_000;

function normalizeTimestamp(value: number): number {
  if (!Number.isFinite(value)) {
    return Date.now();
  }
  // If the value looks like seconds, convert to ms
  if (value < 1_000_000_000_000) {
    return value * 1000;
  }
  return value;
}

export function createAlphaClient(options: AlphaClientOptions): AlphaClient {
  const logger = createLogger('policy.alpha-client');
  const baseUrl = options.baseUrl ?? null;
  const horizons = new Set<Horizon>((options.horizons ?? ['10m', '60m', '24h']) as Horizon[]);
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cache = new Map<string, AlphaScoreEntry>();

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
        const tsRaw = typeof payload.ts === 'number' ? payload.ts : Date.now();
        remember(payload.mint, horizon, payload.score, normalizeTimestamp(tsRaw));
      }
    });
  } else {
    logger.warn('alpha client disabled: no baseUrl provided');
  }

  const getLatestScore = (mint: string, horizon: Horizon): AlphaScoreEntry | undefined => {
    const key = `${mint}:${horizon}`;
    const entry = cache.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.ts > maxAgeMs) {
      cache.delete(key);
      return undefined;
    }
    return entry;
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
