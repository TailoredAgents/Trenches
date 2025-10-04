import 'dotenv/config';
import EventSource from 'eventsource';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter } from '@trenches/metrics';
import { storeTokenCandidate } from '@trenches/persistence';
import { TokenCandidate } from '@trenches/shared';
import { createInMemoryLastEventIdStore, TtlCache, sseQueue, sseRoute, subscribeJsonStream } from '@trenches/util';
import { DiscoveryEventBus } from './eventBus';
import { DexScreenerClient } from './dexscreener';
import { BirdeyeClient } from './birdeye';
import { poolsDiscovered, candidatesEmitted } from './metrics';
import { PoolInitEvent } from './types';
import { buildCandidate } from './candidateBuilder';
import { SolanaTrackerProvider } from './providers/solanatracker';
import { RpcRaydiumWatcher } from './rpcRaydium';

const logger = createLogger('onchain-discovery');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new DiscoveryEventBus();
  const streamDisposers: Array<() => void> = [];
  const raydiumWatcher = new RpcRaydiumWatcher(bus, {
    primaryUrl: config.rpc.primaryUrl,
    wsUrl: config.rpc.wsUrl || undefined,
    httpHeaders: Object.keys(config.rpc.httpHeaders ?? {}).length > 0 ? config.rpc.httpHeaders : undefined
  });
  const dexClient = new DexScreenerClient();
  const birdeyeClient = new BirdeyeClient();
  const stProvider = new SolanaTrackerProvider((ev) => {
    void handleRawPairEvent({
      source: 'solanatracker',
      mint: ev.mint,
      poolAddress: ev.poolAddress,
      baseMint: ev.mint,
      quoteMint: undefined,
      ts: ev.ts ?? Date.now()
    });
  });

  let raydiumWatcherRunning = false;
  let migrationStreamActive = false;
  let providersDisabledWarned = false;
  let offlinePoolWarned = false;
  let solanaTrackerStarted = false;
  let trendingInterval: NodeJS.Timeout | null = null;
  let birdTrendingInterval: NodeJS.Timeout | null = null;

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 180,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  const poolEventsCounter = registerCounter({
    name: 'onchain_pool_events_total',
    help: 'Total Raydium initialize2 events seen'
  });

  const candidateSubscribers = new Set<(candidate: TokenCandidate) => void>();
  const lastEmitted = new Map<string, number>();
  const pendingPoolAttempts = new Map<string, number>();

  bus.onPoolInit((event) => {
    poolsDiscovered.inc();
    poolEventsCounter.inc();
    void handlePoolInit(event);
  });

  bus.onCandidate((candidate) => {
    candidatesEmitted.inc();
    candidateSubscribers.forEach((fn) => fn(candidate));
    try {
      storeTokenCandidate(candidate);
    } catch (err) {
      logger.error({ err }, 'failed to persist candidate');
    }
  });

  const trendingIntervalMs = Math.max(10_000, config.caching.dexscreenerTrendingTtlSec * 1000);
  const birdTrendingIntervalMs = Math.max(30_000, config.caching.birdeyeTrendingTtlSec * 1000);

  async function handlePoolInit(event: PoolInitEvent) {
    const poolAddress = event.pool;
    const attempt = (pendingPoolAttempts.get(poolAddress) ?? 0) + 1;
    pendingPoolAttempts.set(poolAddress, attempt);
    if (offline) {
      if (!offlinePoolWarned) {
        logger.warn('NO_RPC=1; skipping pool init handling');
        offlinePoolWarned = true;
      }
      pendingPoolAttempts.delete(poolAddress);
      return;
    }
    if (providersOff) {
      if (!providersDisabledWarned) {
        logger.warn('DISABLE_PROVIDERS=1; providers disabled; skipping pool init handling');
        providersDisabledWarned = true;
      }
      pendingPoolAttempts.delete(poolAddress);
      return;
    }
    try {
      await dexClient.ensurePairs([poolAddress]);
      const pair = dexClient.getPair(poolAddress);
      if (!pair) {
        if (attempt < 8) {
          setTimeout(() => void handlePoolInit(event), Math.min(1000 * attempt, 8000));
        } else {
          logger.warn({ pool: poolAddress }, 'unable to resolve dexscreener pair after retries');
          pendingPoolAttempts.delete(poolAddress);
        }
        return;
      }
      await emitCandidateFromPair(pair, event);
      pendingPoolAttempts.delete(poolAddress);
    } catch (err) {
      logger.error({ err, pool: poolAddress }, 'handlePoolInit error');
    }
  }

  async function emitCandidateFromPair(pair: Parameters<typeof buildCandidate>[0]['pair'], pool: PoolInitEvent | null) {
    const now = Date.now();
    const mint = pair.baseToken?.address;
    if (!mint) {
      return;
    }
    if (!shouldEmit(mint, now)) {
      return;
    }
    try {
      const candidate = await buildCandidate({
        now,
        pool: pool ?? {
          programId: '',
          pool: pair.pairAddress,
          timestamp: new Date(now).toISOString(),
          slot: 0,
          txHash: ''
        },
        pair,
        birdeye: birdeyeClient
      });
      if (!candidate) {
        lastEmitted.delete(mint);
        return;
      }
      bus.emitCandidate(candidate);
    } catch (err) {
      logger.error({ err }, 'failed to build candidate');
      lastEmitted.delete(mint);
    }
  }

  async function handleRawPairEvent(event: { source: string; mint?: string; poolAddress?: string; baseMint?: string; quoteMint?: string; ts?: number }): Promise<void> {
    const now = Date.now();
    const key = `${event.mint ?? ''}:${event.poolAddress ?? ''}`;
    if (!shouldEmit(key, now, 1_200_000)) {
      return;
    }
    try {
      let pair: any | undefined;
      if (event.poolAddress) {
        await dexClient.ensurePairs([event.poolAddress]);
        pair = dexClient.getPair(event.poolAddress);
      }
      if (!pair) {
        pair = {
          pairAddress: event.poolAddress ?? (event.mint ?? 'unknown'),
          baseToken: { address: event.mint ?? event.baseMint ?? '' },
          quoteToken: { address: event.quoteMint ?? '' },
          createdAt: event.ts ?? now
        };
      }
      const candidate = await buildCandidate({
        now,
        pool: {
          programId: event.source,
          pool: pair.pairAddress,
          timestamp: new Date(event.ts ?? now).toISOString(),
          slot: 0,
          txHash: ''
        },
        pair,
        birdeye: birdeyeClient
      });
      if (!candidate) {
        lastEmitted.delete(key);
        return;
      }
      bus.emitCandidate(candidate);
    } catch (err) {
      logger.error({ err }, 'failed to handle raw pair event');
      lastEmitted.delete(key);
    }
  }

  function shouldEmit(key: string, now: number, debounceMs = 1_200_000): boolean {
    const last = lastEmitted.get(key);
    if (last && now - last < debounceMs) {
      return false;
    }
    lastEmitted.set(key, now);
    return true;
  }

  // DexScreener API is public and does not require an API key.
  app.get('/healthz', async () => ({
    status: offline ? 'degraded' : 'ok',
    detail: offline ? 'rpc_missing' : 'ready',
    offline,
    providersOff,
    watchers: {
      raydium: raydiumWatcherRunning ? 'running' : (offline ? 'offline' : 'idle'),
      migration: migrationStreamActive ? 'running' : (offline ? 'offline' : 'idle')
    },
    dexscreener: !providersOff,
    birdeyeApiKey: Boolean(process.env.BIRDEYE_API_KEY),
    providers: {
      dexscreener: providersOff ? { state: 'disabled', detail: 'providers_disabled' } : { state: 'enabled' },
      birdeye: providersOff ? { state: 'disabled', detail: 'providers_disabled' } : { state: 'enabled', apiKey: Boolean(process.env.BIRDEYE_API_KEY) },
      solanatracker: providersOff ? { state: 'disabled', detail: 'providers_disabled' } : stProvider.getHealth()
    }
  }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    const metrics = await registry.metrics();
    reply.header('Content-Type', registry.contentType);
    reply.send(metrics);
  });

  app.get('/events/candidates', async (_request, reply) => {
    const stream = sseQueue<TokenCandidate>();
    const listener = (candidate: TokenCandidate) => {
      stream.push(candidate);
    };
    candidateSubscribers.add(listener);
    sseRoute(reply, stream.iterator, () => {
      candidateSubscribers.delete(listener);
      stream.close();
    });
  });

  const address = await app.listen({ port: config.services.onchainDiscovery.port, host: '0.0.0.0' });
  logger.info({ address }, 'onchain discovery listening');

  if (!offline) {
    try {
      await raydiumWatcher.start();
      raydiumWatcherRunning = true;
    } catch (err) {
      logger.error({ err }, 'failed to start raydium watcher');
    }
    if (!providersOff) {
      try {
        stProvider.start();
        solanaTrackerStarted = true;
      } catch (err) {
        logger.error({ err }, 'failed to start solanatracker provider');
      }
      trendingInterval = setInterval(() => {
        void (async () => {
          try {
            const pairs = await dexClient.fetchTrending();
            for (const pair of pairs) {
              await emitCandidateFromPair(pair, null);
            }
          } catch (err) {
            logger.error({ err }, 'trending loop failed');
          }
        })();
      }, trendingIntervalMs);
      birdTrendingInterval = setInterval(() => {
        void (async () => {
          try {
            const tokens = await birdeyeClient.fetchTrending('1h');
            const addresses = tokens.map((token) => token.address).filter(Boolean) as string[];
            if (addresses.length > 0) {
              await birdeyeClient.ensurePrices([...addresses, SOL_MINT]);
            }
          } catch (err) {
            logger.error({ err }, 'birdeye trending loop failed');
          }
        })();
      }, birdTrendingIntervalMs);
    } else {
      logger.warn('DISABLE_PROVIDERS=1; skipping solanatracker provider and trending loops');
    }
  } else {
    logger.warn('NO_RPC=1; skipping RPC-dependent watchers');
  }

  // Optionally consume migrations as high-priority seeds
  if (!offline && (config as any).features?.migrationWatcher !== false) {
    const url = `http://127.0.0.1:${(config as any).services?.migrationWatcher?.port ?? 4018}/events/migrations`;
    const lastEventIdStore = createInMemoryLastEventIdStore();
    const migrationDedup = new TtlCache<string, boolean>(2 * 60 * 1000);
    const client = subscribeJsonStream<{ ts: number; mint: string; pool: string; source: string; initSig: string }>(url, {
      lastEventIdStore,
      eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
      onOpen: () => {
        migrationStreamActive = true;
        logger.info({ url }, 'connected to migration watcher');
      },
      onError: (err, attempt) => {
        migrationStreamActive = false;
        logger.error({ err, attempt, url }, 'migration watcher stream error');
      },
      onParseError: (err) => {
        logger.error({ err }, 'failed to parse migration event');
      },
      onMessage: (payload, event) => {
        const eventId = event.lastEventId ?? undefined;
        if (eventId && migrationDedup.get(eventId)) {
          return;
        }
        if (eventId) {
          migrationDedup.set(eventId, true);
        }
        const dedupKey = payload.initSig ? `sig:${payload.initSig}` : payload.pool ? `pool:${payload.pool}` : undefined;
        if (dedupKey) {
          if (migrationDedup.get(dedupKey)) {
            return;
          }
          migrationDedup.set(dedupKey, true);
        }
        void handleRawPairEvent({ source: payload.source, mint: payload.mint, poolAddress: payload.pool, ts: payload.ts });
      }
    });
    streamDisposers.push(() => {
      migrationStreamActive = false;
      client.dispose();
    });
  } else if ((config as any).features?.migrationWatcher !== false) {
    logger.warn('migration watcher stream disabled due to offline mode');
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down onchain discovery');
    if (trendingInterval) {
      clearInterval(trendingInterval);
      trendingInterval = null;
    }
    if (birdTrendingInterval) {
      clearInterval(birdTrendingInterval);
      birdTrendingInterval = null;
    }
    for (const dispose of streamDisposers.splice(0)) {
      try {
        dispose();
      } catch (err) {
        logger.error({ err }, 'failed to dispose stream');
      }
    }
    if (raydiumWatcherRunning) {
      try {
        await raydiumWatcher.stop();
      } catch (err) {
        logger.error({ err }, 'failed to stop raydium watcher');
      }
    }
    if (solanaTrackerStarted) {
      try {
        stProvider.stop();
      } catch (err) {
        logger.error({ err }, 'failed to stop solanatracker provider');
      }
    }
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    process.exit(0);
  }
}

bootstrap().catch((err) => {
  logger.error({ err }, 'onchain discovery failed to start');
  process.exit(1);
});
