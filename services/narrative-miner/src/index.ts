import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import EventSource from 'eventsource';
import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { loadConfig, TrenchesConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry } from '@trenches/metrics';
import { SocialEngagement, SocialPost, TokenCandidate, TopicEvent } from '@trenches/shared';
import { fetchTopicClusters, fetchTopicWindows } from '@trenches/persistence';
import { NarrativeEventBus } from './eventBus';
import { DefaultNarrativePersistence, NarrativePersistence } from './persistence';
import { extractPhrases } from './phraseExtractor';
import { PhraseTracker } from './phraseTracker';
import { BaselineManager } from './baseline';
import { ClusterManager, ClusterManagerOptions } from './cluster';
import { WatchWindowEvent, WatchWindowManager } from './watchWindows';
import { Matcher } from './matcher';
import {
  activeTopicsGauge,
  activeWatchWindowsGauge,
  topicEventsCounter,
  matchAttemptsCounter,
  matchHitsCounter,
  matchLatency,
  ingestEventsCounter,
  dedupeCacheGauge
} from './metrics';
import { DedupeCache } from './dedupe';
import { LunarCrushOverlay } from './providers/lunarcrush';

const logger = createLogger('narrative-miner');

type StreamState = 'connecting' | 'connected' | 'error' | 'disabled';

interface StreamStatus {
  state: StreamState;
  attempts: number;
  lastError?: string;
}

export interface NarrativeMinerOptions {
  persistence?: NarrativePersistence;
  disableStreams?: boolean;
  startHttp?: boolean;
  urls?: {
    social?: string;
    candidates?: string;
  };
  configOverride?: TrenchesConfig;
  deterministicOverride?: {
    vectorizerModule?: string;
    seed?: number;
  };
}

export interface NarrativeMinerHandle {
  app: FastifyInstance;
  bus: NarrativeEventBus;
  config: TrenchesConfig;
  processSocial(input: string | SocialPost): Promise<void>;
  processCandidate(input: string | TokenCandidate): Promise<void>;
  shutdown(reason?: string): Promise<void>;
}

export async function createNarrativeMiner(options: NarrativeMinerOptions = {}): Promise<NarrativeMinerHandle> {
  const config = options.configOverride ?? loadConfig();
  const disableStreams = options.disableStreams ?? Boolean(config.topics.test?.enabled);
  const app = Fastify({ logger: false });
  const bus = new NarrativeEventBus();
  const persistenceLayer = options.persistence ?? new DefaultNarrativePersistence();
  const phraseTracker = new PhraseTracker();
  const phraseStopwords = Array.isArray(config.topics.phrase.stopwords) ? config.topics.phrase.stopwords : [];
  const stopwords = new Set<string>(phraseStopwords.map((word) => String(word).toLowerCase()));
  const windowReplayGuard = new Map<string, number>();
  const socialDeduper = new DedupeCache(15 * 60 * 1000);
  const candidateDeduper = new DedupeCache(60 * 60 * 1000);
  dedupeCacheGauge.set({ stream: 'social' }, socialDeduper.size(Date.now()));
  dedupeCacheGauge.set({ stream: 'candidate' }, candidateDeduper.size(Date.now()));

  let socialStatus: StreamStatus = disableStreams
    ? { state: 'disabled', attempts: 0 }
    : { state: 'connecting', attempts: 0 };
  let candidateStatus: StreamStatus = disableStreams
    ? { state: 'disabled', attempts: 0 }
    : { state: 'connecting', attempts: 0 };

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 240,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  const deterministic = await resolveDeterministicOptions(config, options.deterministicOverride);
  if (deterministic.enabled) {
    logger.info(
      {
        seed: deterministic.seed,
        vectorizerModule: options.deterministicOverride?.vectorizerModule ?? config.topics.test?.vectorizerModule
      },
      'narrative miner deterministic mode enabled'
    );
  }
  const clusterOptions: ClusterManagerOptions | undefined = deterministic.enabled
    ? {
        ...(deterministic.vectorizer ? { vectorizer: deterministic.vectorizer } : {}),
        ...(deterministic.seed !== undefined ? { lshSeed: deterministic.seed } : {})
      }
    : undefined;
  const matcherOptions = deterministic.enabled && deterministic.vectorizer ? { vectorizer: deterministic.vectorizer } : undefined;

  const baselineManager = new BaselineManager(
    config.topics.baseline.halfLifeSec,
    config.topics.baseline.flushIntervalSec,
    logger
  );

  const clusterManager = new ClusterManager(
    config.topics.cluster,
    config.topics.scoring,
    { uniquesMin: config.gating.uniquesMin },
    config.topics.baseline.halfLifeSec,
    config.watchWindows.durationSec,
    clusterOptions
  );

  const watchManager = new WatchWindowManager({
    durationSec: config.watchWindows.durationSec,
    refreshIntervalSec: config.watchWindows.refreshIntervalSec,
    openThreshold: config.topics.scoring.openThreshold,
    sustainThreshold: config.topics.scoring.sustainThreshold
  });

  const matcher = new Matcher(config.topics.matching, matcherOptions);

  await baselineManager.initialize();
  baselineManager.start();

  // Start LunarCrush overlay (coach-only bias)
  const lunar = new LunarCrushOverlay();
  try { lunar.start(); } catch (err) { logger.error({ err }, 'failed to start lunarcrush overlay'); }

  const now = Date.now();
  clusterManager.bootstrap(fetchTopicClusters(), now);
  watchManager.bootstrap(fetchTopicWindows());
  for (const descriptor of clusterManager.listClusterDescriptors()) {
    matcher.setCluster(descriptor);
  }

  for (const windowRecord of watchManager.active(now)) {
    const ts = Date.parse(windowRecord.lastRefresh);
    if (Number.isFinite(ts)) {
      windowReplayGuard.set(windowRecord.windowId, ts);
    }
  }

  const expired = watchManager.prune(now);
  if (expired.length > 0) {
    handleWindowEvents(expired, persistenceLayer, windowReplayGuard);
  }

  updateGauges(clusterManager, watchManager, Date.now());

  app.get('/healthz', async () => {
    const nowTs = Date.now();
    return {
      status: socialStatus.state === 'connected' && candidateStatus.state === 'connected' ? 'ok' : 'degraded',
      social: socialStatus,
      candidates: candidateStatus,
      topics: clusterManager.getClusterCount(),
      windows: watchManager.active(nowTs).length,
      providers: {
        lunarcrush: ((): { status: 'ok' | 'degraded'; lastPollTs: number | null; message?: string } => {
          try {
            return (lunar as any).getHealth();
          } catch {
            return { status: 'degraded', lastPollTs: null, message: 'not_started' };
          }
        })()
      }
    };
  });

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/events/topics', async (request, reply) => {
    const { iterator, close } = createTopicIterator(bus);
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  app.get('/events/candidates', async (request, reply) => {
    const { iterator, close } = createCandidateIterator(bus);
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  const pruneInterval = setInterval(() => {
    const events = watchManager.prune(Date.now());
    if (events.length > 0) {
      handleWindowEvents(events, persistenceLayer, windowReplayGuard);
      updateGauges(clusterManager, watchManager, Date.now());
    }
  }, Math.max(1_000, config.watchWindows.refreshIntervalSec * 250));
  pruneInterval.unref();

  const processSocial = async (input: string | SocialPost): Promise<void> => {
    let post: SocialPost;
    if (typeof input === 'string') {
      try {
        post = JSON.parse(input) as SocialPost;
      } catch (err) {
        ingestEventsCounter.inc({ stream: 'social', result: 'invalid' });
        logger.error({ err }, 'invalid social payload');
        return;
      }
    } else {
      post = input;
    }

    const nowMs = Date.now();
    const dedupeHit = post.id ? socialDeduper.has(post.id, nowMs) : false;
    dedupeCacheGauge.set({ stream: 'social' }, socialDeduper.size(nowMs));
    if (dedupeHit) {
      ingestEventsCounter.inc({ stream: 'social', result: 'duplicate' });
      return;
    }
    ingestEventsCounter.inc({ stream: 'social', result: 'processed' });

    const timestamp = parseTimestamp(post);
    const engagement = Math.max(0.1, scoreEngagement(post.engagement));
    const phrases = extractPhrases(post, {
      minLength: config.topics.phrase.minLength,
      maxLength: config.topics.phrase.maxLength,
      stopwords
    });

    for (const phrase of phrases) {
      const observation = phraseTracker.observe(phrase.key, {
        timestamp,
        authorId: post.authorId,
        engagement
      });
      if (observation.postsPerMinute <= 0) {
        continue;
      }
      const baselineSnapshot = baselineManager.snapshot(phrase.key, timestamp);
      const update = clusterManager.observe(
        phrase,
        observation,
        baselineSnapshot,
        { platform: post.platform, now: timestamp }
      );
      baselineManager.applyObservation(
        phrase.key,
        { count: 1, engagement, authors: 1 },
        timestamp
      );

      const descriptor = clusterManager.getClusterDescriptor(update.topicId);
      if (descriptor) {
        matcher.setCluster(descriptor);
        persistCluster(descriptor, update, timestamp, persistenceLayer).catch((err) => {
          logger.error({ err }, 'failed persisting cluster');
        });
      }

      // Apply tiny LunarCrush bias as a nudge (never cross open threshold)
      const biasCfg = config.lunarcrush?.sssBias ?? { topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 };
      const hits = lunar.getBiasFor(update.label, post.authorHandle);
      const baseSss = update.sss;
      const baseDecayed = update.decayedSss;
      let add = 0;
      if (hits.topic) add += biasCfg.topicBoost;
      if (hits.influencer) add += biasCfg.influencerBoost;
      add = Math.min(add, biasCfg.maxBoost);
      // Do not allow the overlay to push decayed SSS above openThreshold by itself
      const openThreshold = config.topics.scoring.openThreshold;
      let boostedDecayed = baseDecayed + add;
      if (baseDecayed < openThreshold && boostedDecayed >= openThreshold) {
        boostedDecayed = Math.max(baseDecayed, Math.min(openThreshold - 0.001, baseDecayed + biasCfg.maxBoost));
      }
      const boostedSss = Math.min(1, baseSss + add);

      const windowEvents = watchManager.ingest(
        {
          topicId: update.topicId,
          sss: boostedDecayed,
          novelty: update.novelty,
          windowSeconds: update.windowSeconds
        },
        timestamp
      );

      const windowRecord = watchManager.getWindow(update.topicId, timestamp);
      const windowSec = windowRecord
        ? Math.max(0, Math.round((Date.parse(windowRecord.expiresAt) - timestamp) / 1000))
        : config.watchWindows.durationSec;

      const topicEvent: TopicEvent = {
        t: 'topic_spike',
        topicId: update.topicId,
        label: update.label,
        sss: boostedSss,
        decayedSss: boostedDecayed,
        novelty: update.novelty,
        windowSec,
        sources: update.sources,
        cluster: {
          phrases: descriptor?.phrases ?? [],
          addedPhrases: update.addedPhrases,
          centroid: descriptor ? Array.from(descriptor.centroid) : []
        }
      };

      Promise.resolve(persistenceLayer.recordTopic(topicEvent)).catch((err) => {
        logger.error({ err }, 'failed to persist topic event');
      });

      bus.emitTopic(topicEvent);

      if (windowEvents.length > 0) {
        handleWindowEvents(windowEvents, persistenceLayer, windowReplayGuard);
      } else {
        topicEventsCounter.inc({ kind: 'update' });
      }
    }

    updateGauges(clusterManager, watchManager, Date.now());
  };

  const processCandidate = async (input: string | TokenCandidate): Promise<void> => {
    let candidate: TokenCandidate;
    if (typeof input === 'string') {
      try {
        candidate = JSON.parse(input) as TokenCandidate;
      } catch (err) {
        ingestEventsCounter.inc({ stream: 'candidate', result: 'invalid' });
        logger.error({ err }, 'invalid candidate payload');
        return;
      }
    } else {
      candidate = { ...input };
    }

    const nowMs = Date.now();
    const dedupeHit = candidate.mint ? candidateDeduper.has(candidate.mint, nowMs) : false;
    dedupeCacheGauge.set({ stream: 'candidate' }, candidateDeduper.size(nowMs));
    if (dedupeHit) {
      ingestEventsCounter.inc({ stream: 'candidate', result: 'duplicate' });
      return;
    }
    ingestEventsCounter.inc({ stream: 'candidate', result: 'processed' });

    const start = performance.now();
    const windows = watchManager.active(nowMs);
    matchAttemptsCounter.inc();
    const result = matcher.matchCandidate(candidate, windows, nowMs);
    if (result) {
      matchHitsCounter.inc();
      candidate.topicId = result.topicId;
      candidate.matchScore = Number(result.score.toFixed(4));
      Promise.resolve(persistenceLayer.recordMatch({
        id: `${candidate.mint}-${nowMs}`,
        topicId: result.topicId,
        mint: candidate.mint,
        matchScore: candidate.matchScore ?? 0,
        matchedAt: new Date(nowMs).toISOString(),
        source: candidate.source
      })).catch((err) => {
        logger.error({ err }, 'failed persisting topic match');
      });
    }

    Promise.resolve(persistenceLayer.storeCandidate(candidate)).catch((err) => {
      logger.error({ err }, 'failed storing candidate');
    });

    bus.emitCandidate(candidate);
    matchLatency.observe(performance.now() - start);
  };

  const streamHandles: StreamHandle[] = [];

  if (!disableStreams) {
    const socialUrl = options.urls?.social ?? `http://127.0.0.1:${config.services.socialIngestor.port}/events/social`;
    const candidateUrl =
      options.urls?.candidates ?? `http://127.0.0.1:${config.services.onchainDiscovery.port}/events/candidates`;

    const socialStream = startStream(socialUrl, (status) => {
      socialStatus = status;
    });
    streamHandles.push(socialStream);
    socialStream.on('message', (payload) => {
      void processSocial(payload).catch((err) => {
        logger.error({ err }, 'failed handling social post');
      });
    });

    const candidateStream = startStream(candidateUrl, (status) => {
      candidateStatus = status;
    });
    streamHandles.push(candidateStream);
    candidateStream.on('message', (payload) => {
      void processCandidate(payload).catch((err) => {
        logger.error({ err }, 'failed handling candidate event');
      });
    });
  }

  let address: string | undefined;
  if (options.startHttp !== false) {
    address = await app.listen({ port: config.services.narrativeMiner.port, host: '0.0.0.0' });
    logger.info({ address }, 'narrative miner listening');
  } else {
    logger.info('narrative miner runtime initialized without HTTP listener');
  }

  const shutdown = async (reason?: string): Promise<void> => {
    logger.warn({ reason }, 'shutting down narrative miner');
    try {
      for (const handle of streamHandles) {
        handle.close();
      }
    } catch (err) {
      logger.error({ err }, 'failed closing streams');
    }
    try {
      clearInterval(pruneInterval);
      await baselineManager.stop();
      if (options.startHttp !== false) {
        await app.close();
      }
    } catch (err) {
      logger.error({ err }, 'failed graceful shutdown');
    }
  };

  return {
    app,
    bus,
    config,
    processSocial,
    processCandidate,
    shutdown
  };
}

interface StreamHandle {
  on(event: 'message', handler: (payload: string) => void): void;
  close(): void;
}

function startStream(url: string, onStatus: (status: StreamStatus) => void): StreamHandle {
  let disposed = false;
  let attempts = 0;
  const emitter = new EventEmitter();
  const store = createInMemoryLastEventIdStore();
  onStatus({ state: 'connecting', attempts: 1 });
  const client = createSSEClient(url, {
    lastEventIdStore: store,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }),
    onOpen: () => {
      attempts = 0;
      onStatus({ state: 'connected', attempts: 0 });
    },
    onError: (err, attempt) => {
      attempts = attempt;
      const nextStatus: StreamStatus = {
        state: 'error',
        attempts: attempt,
        lastError: err instanceof Error ? err.message : 'stream error'
      };
      onStatus(nextStatus);
    },
    onEvent: (event) => {
      if (!event?.data || event.data === 'ping') {
        return;
      }
      emitter.emit('message', String(event.data));
    }
  });

  return {
    on: (event, handler) => {
      emitter.on(event, handler);
    },
    close: () => {
      disposed = true;
      client.dispose();
      emitter.removeAllListeners();
    }
  };
}

function handleWindowEvents(
  events: WatchWindowEvent[],
  persistence: NarrativePersistence,
  guard: Map<string, number>
): void {
  for (const event of events) {
    const record = event.window;
    const key = record.windowId;
    if (event.type === 'closed') {
      guard.delete(key);
      topicEventsCounter.inc({ kind: 'closed' });
      Promise.resolve(persistence.removeWindow(key)).catch((err) => {
        logger.error({ err }, 'failed removing watch window');
      });
      continue;
    }
    const refreshMs = Date.parse(record.lastRefresh);
    if (Number.isFinite(refreshMs)) {
      const last = guard.get(key);
      if (last && refreshMs <= last) {
        continue;
      }
      guard.set(key, refreshMs);
    }
    topicEventsCounter.inc({ kind: event.type });
    Promise.resolve(persistence.recordWindow(record)).catch((err) => {
      logger.error({ err }, 'failed persisting watch window');
    });
  }
}

function createTopicIterator(bus: NarrativeEventBus) {
  const queue: TopicEvent[] = [];
  let notify: (() => void) | undefined;
  const unsubscribe = bus.onTopic((event) => {
    queue.push(event);
    if (notify) {
      notify();
      notify = undefined;
    }
  });

  const iterator = (async function* () {
    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
        const next = queue.shift();
        if (!next) {
          continue;
        }
        yield { data: JSON.stringify(next) };
      }
    } finally {
      unsubscribe();
    }
  })();

  const close = () => {
    if (notify) {
      notify();
      notify = undefined;
    }
    if (iterator.return) {
      void iterator.return(undefined as never);
    }
  };

  return { iterator, close };
}

function createCandidateIterator(bus: NarrativeEventBus) {
  const queue: TokenCandidate[] = [];
  let notify: (() => void) | undefined;
  const unsubscribe = bus.onCandidate((candidate) => {
    queue.push(candidate);
    if (notify) {
      notify();
      notify = undefined;
    }
  });

  const iterator = (async function* () {
    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
        const next = queue.shift();
        if (!next) {
          continue;
        }
        yield { data: JSON.stringify(next) };
      }
    } finally {
      unsubscribe();
    }
  })();

  const close = () => {
    if (notify) {
      notify();
      notify = undefined;
    }
    if (iterator.return) {
      void iterator.return(undefined as never);
    }
  };

  return { iterator, close };
}

function updateGauges(clusterManager: ClusterManager, watchManager: WatchWindowManager, now: number) {
  activeTopicsGauge.set(clusterManager.getClusterCount());
  activeWatchWindowsGauge.set(watchManager.active(now).length);
}

function scoreEngagement(eng: SocialEngagement): number {
  const likes = eng.likes ?? 0;
  const reposts = eng.reposts ?? 0;
  const quotes = eng.quotes ?? 0;
  const replies = eng.replies ?? 0;
  const impressions = eng.impressions ?? 0;
  return likes + 2 * reposts + 2 * quotes + 0.5 * replies + impressions * 0.0005;
}

function parseTimestamp(post: SocialPost): number {
  const preferred = post.capturedAt ?? post.publishedAt;
  if (preferred) {
    const parsed = Date.parse(preferred);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

async function persistCluster(
  descriptor: { topicId: string; label: string; centroid: Float32Array; phrases: string[] },
  update: { topicId: string; sss: number; novelty: number },
  timestamp: number,
  persistence: NarrativePersistence
): Promise<void> {
  await persistence.recordCluster({
    topicId: descriptor.topicId,
    label: descriptor.label,
    centroid: Array.from(descriptor.centroid),
    phrases: descriptor.phrases,
    sss: update.sss,
    novelty: update.novelty,
    updatedAt: new Date(timestamp).toISOString()
  });
}

async function resolveDeterministicOptions(
  config: TrenchesConfig,
  override?: NarrativeMinerOptions['deterministicOverride']
): Promise<{
  enabled: boolean;
  vectorizer?: (text: string) => Float32Array;
  seed?: number;
}> {
  const testConfig = config.topics.test ?? { enabled: false };
  const forced = override?.vectorizerModule !== undefined || override?.seed !== undefined;
  const shouldEnable = forced ? true : testConfig.enabled ?? false;
  const modulePath = override?.vectorizerModule ?? testConfig.vectorizerModule;
  const seed = override?.seed ?? testConfig.seed;

  if (!shouldEnable) {
    return { enabled: false };
  }

  let vectorizer: ((text: string) => Float32Array) | undefined;
  if (modulePath) {
    vectorizer = await loadVectorizerFromPath(modulePath);
  }

  return {
    enabled: true,
    vectorizer,
    seed
  };
}

async function loadVectorizerFromPath(modulePath: string): Promise<(text: string) => Float32Array> {
  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
  const moduleUrl = pathToFileURL(resolved).href;
  const mod: any = await import(moduleUrl);

  if (typeof mod.createVectorizer === 'function') {
    const created = mod.createVectorizer();
    if (typeof created === 'function') {
      return created;
    }
    if (created && typeof created.vectorizer === 'function') {
      return created.vectorizer;
    }
  }
  if (typeof mod.vectorizer === 'function') {
    return mod.vectorizer;
  }
  if (typeof mod.default === 'function') {
    return mod.default;
  }
  throw new Error(`Vectorizer module at ${resolved} must export a function`);
}

if (require.main === module) {
  void (async () => {
    try {
      const miner = await createNarrativeMiner();
      const handleShutdown = (signal: NodeJS.Signals) => {
        void miner.shutdown(signal).finally(() => {
          process.exit(0);
        });
      };
      process.on('SIGTERM', handleShutdown);
      process.on('SIGINT', handleShutdown);
    } catch (err) {
      logger.error({ err }, 'narrative miner failed to start');
      process.exit(1);
    }
  })();
}

