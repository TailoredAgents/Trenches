import 'dotenv/config';
import EventSource from 'eventsource';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { Connection } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry } from '@trenches/metrics';
import { insertRugVerdict } from '@trenches/persistence';
import { storeTokenCandidate } from '@trenches/persistence';
import { TokenCandidate } from '@trenches/shared';
import { TtlCache, createRpcConnection, createSSEClient, createInMemoryLastEventIdStore } from '@trenches/util';
import { SafetyEventBus } from './eventBus';
import { safetyEvaluations, safetyPasses, safetyBlocks, ocrsGauge, evaluationDuration, authorityPassRatio, avgRugProb } from './metrics';
import { checkTokenSafety } from './tokenSafety';
import { checkLpSafety } from './lpSafety';
import { checkHolderSkew } from './holderSafety';
// OCRS deprecated: RugGuard is the sole gate
import { classify, candidateToFeatures } from './rugguard';
import { SafetyEvaluation } from './types';
const logger = createLogger('safety-engine');
const EVALUATION_CACHE_MS = 30_000;

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new SafetyEventBus();
  const candidateCache = new TtlCache<string, SafetyEvaluation>(EVALUATION_CACHE_MS);

  const connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 180,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  app.get('/healthz', async () => ({
    status: 'ok',
    rpc: config.rpc.primaryUrl,
    feed: config.safety.candidateFeedUrl ?? `http://127.0.0.1:${config.services.onchainDiscovery.port}/events/candidates`
  }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/events/safe', async (request, reply) => {
    const { iterator, close } = createIterator(bus, 'safe');
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  app.get('/events/blocked', async (request, reply) => {
    const { iterator, close } = createIterator(bus, 'blocked');
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  const address = await app.listen({ port: config.services.safetyEngine.port, host: '0.0.0.0' });
  logger.info({ address }, 'safety engine listening');

  const feedUrl = config.safety.candidateFeedUrl ?? `http://127.0.0.1:${config.services.onchainDiscovery.port}/events/candidates`;
  startCandidateStream(feedUrl, async (candidate) => {
    try {
      const result = await evaluateCandidate(candidate, connection, config, candidateCache);
      const decorated: TokenCandidate = {
        ...candidate,
        safety: { ok: result.ok, reasons: result.reasons },
        ocrs: 0,
        rugProb: (result as any).rugProb ?? undefined
      };
      try {
        storeTokenCandidate(decorated);
      } catch (err) {
        logger.error({ err }, 'failed to persist candidate after evaluation');
      }
      if (decorated.safety.ok) {
        bus.emitSafe(decorated);
        safetyPasses.inc();
      } else {
        for (const reason of result.reasons) {
          safetyBlocks.inc({ reason });
        }
        bus.emitBlocked({ candidate: decorated, reasons: result.reasons });
      }
    } catch (err) {
      logger.error({ err }, 'safety evaluation failed');
    }
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down safety engine');
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    process.exit(0);
  }
}

type StreamHandler = (candidate: TokenCandidate) => void | Promise<void>;

function startCandidateStream(url: string, handler: StreamHandler) {
  const lastEventIdStore = createInMemoryLastEventIdStore();
  const dedup = new TtlCache<string, boolean>(2 * 60 * 1000);
  const client = createSSEClient(url, {
    lastEventIdStore,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
    onOpen: () => {
      logger.info({ url }, 'connected to candidate stream');
    },
    onEvent: async (event) => {
      if (!event?.data || event.data === 'ping') {
        return;
      }
      const eventId = event.lastEventId ?? undefined;
      if (eventId && dedup.get(eventId)) {
        return;
      }
      if (eventId) {
        dedup.set(eventId, true);
      }
      let candidate: TokenCandidate;
      try {
        candidate = JSON.parse(event.data) as TokenCandidate;
      } catch (err) {
        logger.error({ err }, 'failed to parse candidate payload');
        return;
      }
      try {
        await handler(candidate);
      } catch (err) {
        logger.error({ err }, 'candidate handler failed');
      }
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt, url }, 'candidate stream error');
    }
  });
  return () => {
    client.dispose();
  };
}

async function evaluateCandidate(
  candidate: TokenCandidate,
  connection: Connection,
  config: ReturnType<typeof loadConfig>,
  cache: TtlCache<string, SafetyEvaluation>
): Promise<SafetyEvaluation> {
  const cacheKey = candidate.mint;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const start = Date.now();
  const reasons: string[] = [];

  const tokenResult = await checkTokenSafety(connection, candidate.mint);
  if (!tokenResult.ok) {
    reasons.push(...tokenResult.reasons);
  }

  const lpResult = await checkLpSafety(
    connection,
    candidate.lpMint,
    config.safety.lockerPrograms,
    config.safety.lpBurnThreshold
  );
  if (!lpResult.ok) {
    reasons.push(...lpResult.reasons);
  }

  const holderResult = await checkHolderSkew(
    connection,
    candidate.mint,
    config.safety.ignoreAccounts,
    [candidate.poolCoinAccount, candidate.poolPcAccount, candidate.poolAddress],
    config.safety.holderTopCap
  );
  if (!holderResult.ok) {
    reasons.push(...holderResult.reasons);
  }

  const gatingReasons = evaluateGating(candidate, config);
  reasons.push(...gatingReasons);

  const featureFlags = (config as any).features ?? {};
  const rugGuardEnabled = featureFlags.rugGuard !== false;
  let rugProb = 0.5;
  if (rugGuardEnabled) {
    try {
      const verdict = await classify(candidate.mint, candidateToFeatures(candidate), { connection });
      rugProb = verdict.rugProb;
      insertRugVerdict({ ts: verdict.ts, mint: verdict.mint, rugProb: verdict.rugProb, reasons: verdict.reasons });
      if (verdict.reasons.includes('mint_or_freeze_active')) {
        reasons.push('mint_or_freeze_active');
      }
      const prev = (authorityPassRatio as any)._last || { pass: 0, total: 0 };
      const pass = verdict.reasons.includes('mint_or_freeze_active') ? 0 : 1;
      const total = prev.total + 1;
      const passes = prev.pass + pass;
      (authorityPassRatio as any)._last = { pass: passes, total };
      authorityPassRatio.set(total > 0 ? passes / total : 0);
      const prevR = (avgRugProb as any)._last || { sum: 0, n: 0 };
      const sum = prevR.sum + rugProb;
      const n = prevR.n + 1;
      (avgRugProb as any)._last = { sum, n };
      avgRugProb.set(sum / Math.max(1, n));
    } catch (err) {
      logger.error({ err }, 'rugguard classify failed');
    }
  }

  const ok = reasons.length === 0;
  const evaluation: SafetyEvaluation = {
    ok,
    reasons,
    ocrs: 0,
    whaleFlag: holderResult.whaleFlag,
    features: {},
    rugProb
  };

  safetyEvaluations.inc();
  ocrsGauge.set(evaluation.ocrs);
  evaluationDuration.set(Date.now() - start);

  cache.set(cacheKey, evaluation);
  return evaluation;
}

function evaluateGating(candidate: TokenCandidate, config: ReturnType<typeof loadConfig>): string[] {
  const reasons: string[] = [];
  if (candidate.lpSol < config.gating.lpMinSol) {
    reasons.push('lp_insufficient');
  }
  const flowRatio = candidate.sells60 === 0 ? candidate.buys60 : candidate.buys60 / candidate.sells60;
  if (flowRatio < config.gating.buysSellRatioMin) {
    reasons.push('flow_ratio_low');
  }
  if (candidate.uniques60 < config.gating.uniquesMin) {
    reasons.push('uniques_low');
  }
  if (candidate.ageSec < config.gating.minPoolAgeSec) {
    reasons.push('age_too_low');
  }
  if (candidate.spreadBps > config.gating.maxSpreadBps) {
    reasons.push('spread_too_high');
  }
  return reasons;
}

type EventChannel = 'safe' | 'blocked';

type IteratorPayload = { data: string };

type IteratorFactory = (bus: SafetyEventBus, channel: EventChannel) => { iterator: AsyncGenerator<IteratorPayload>; close: () => void };

const createIterator: IteratorFactory = (bus, channel) => {
  const queue: IteratorPayload[] = [];
  let notify: (() => void) | undefined;

  const listenerSafe = (payload: TokenCandidate) => {
    queue.push({ data: JSON.stringify(payload) });
    if (notify) {
      notify();
      notify = undefined;
    }
  };

  const listenerBlocked = (payload: { candidate: TokenCandidate; reasons: string[] }) => {
    queue.push({ data: JSON.stringify(payload) });
    if (notify) {
      notify();
      notify = undefined;
    }
  };

  const unsubscribe = channel === 'safe' ? bus.onSafe(listenerSafe) : bus.onBlocked(listenerBlocked);

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
        yield next;
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
    unsubscribe();
  };

  return { iterator, close };
};

bootstrap().catch((err) => {
  logger.error({ err }, 'safety engine failed to start');
  process.exit(1);
});
