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
import { insertRugVerdict, storeTokenCandidate, listRecentSocialPosts } from '@trenches/persistence';
import { TokenCandidate } from '@trenches/shared';
import { TtlCache, createRpcConnection, createInMemoryLastEventIdStore, subscribeJsonStream, sseQueue, sseRoute } from '@trenches/util';
import { SafetyEventBus } from './eventBus';
import { safetyEvaluations, safetyPasses, safetyBlocks,  evaluationDuration, authorityPassRatio, avgRugProb, pumpInferencesTotal, rugguardAvgPumpProb } from './metrics';
import { checkTokenSafety } from './tokenSafety';
import { checkLpSafety } from './lpSafety';
import { checkHolderSkew } from './holderSafety';
// Legacy score gate deprecated: RugGuard is the sole gate
import { classify, candidateToFeatures } from './rugguard';
import { scoreText } from './pumpClassifier';
import { SafetyEvaluation } from './types';
const logger = createLogger('safety-engine');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';
const EVALUATION_CACHE_MS = 30_000;
const PUMP_KEYWORD_WINDOW_MS = 15 * 60 * 1000;

function extractPumpKeywords(candidate: TokenCandidate): string[] {
  const keywords = new Set<string>();
  const symbol = (candidate.symbol ?? '').toLowerCase();
  if (symbol.length > 1) {
    keywords.add(symbol);
    if (!symbol.startsWith('$') && symbol.length > 2) {
      keywords.add(`$${symbol}`);
    }
  }
  const name = (candidate.name ?? '').toLowerCase();
  if (name) {
    for (const part of name.split(/[^a-z0-9]+/)) {
      if (part.length > 2) {
        keywords.add(part);
      }
    }
  }
  return Array.from(keywords);
}

function textMatchesKeywords(text: string, keywords: string[]): boolean {
  if (!keywords.length) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => kw.length > 2 && lower.includes(kw));
}


async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new SafetyEventBus();
  const candidateCache = new TtlCache<string, SafetyEvaluation>(EVALUATION_CACHE_MS);

  let connection: Connection | null = null;
  if (!offline) {
    connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  } else {
    logger.warn('NO_RPC=1; safety-engine running without RPC connection');
  }

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 180,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  app.get('/healthz', async () => ({
    status: offline ? 'degraded' : 'ok',
    offline,
    providersOff,
    rpc: config.rpc.primaryUrl,
    feed: config.safety.candidateFeedUrl ?? `http://127.0.0.1:${config.services.onchainDiscovery.port}/events/candidates`
  }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/events/safe', async (_request, reply) => {
    const stream = sseQueue<TokenCandidate>();
    const unsubscribe = bus.onSafe((candidate) => {
      stream.push(candidate);
    });
    sseRoute(reply, stream.iterator, () => {
      unsubscribe();
      stream.close();
    });
  });

  app.get('/events/blocked', async (_request, reply) => {
    const stream = sseQueue<{ candidate: TokenCandidate; reasons: string[] }>();
    const unsubscribe = bus.onBlocked((payload) => {
      stream.push(payload);
    });
    sseRoute(reply, stream.iterator, () => {
      unsubscribe();
      stream.close();
    });
  });

  const address = await app.listen({ port: config.services.safetyEngine.port, host: '0.0.0.0' });
  logger.info({ address }, 'safety engine listening');

  const feedUrl = config.safety.candidateFeedUrl ?? `http://127.0.0.1:${config.services.onchainDiscovery.port}/events/candidates`;
  let disposeStream: (() => void) | null = null;
  if (!offline && connection) {
    disposeStream = startCandidateStream(feedUrl, async (candidate) => {
      try {
        const result = await evaluateCandidate(candidate, connection, config, candidateCache);
        const decorated: TokenCandidate = {
          ...candidate,
          safety: { ok: result.ok, reasons: result.reasons },        rugProb: (result as any).rugProb ?? undefined
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
  } else {
    logger.warn('candidate stream disabled due to offline mode');
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down safety engine');
    try {
      disposeStream?.();
    } catch (err) {
      logger.error({ err }, 'failed to dispose candidate stream');
    }
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
  const client = subscribeJsonStream<TokenCandidate>(url, {
    lastEventIdStore,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
    onOpen: () => {
      logger.info({ url }, 'connected to candidate stream');
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt, url }, 'candidate stream error');
    },
    onParseError: (err) => {
      logger.error({ err }, 'failed to parse candidate payload');
    },
    onMessage: async (candidate, event) => {
      const eventId = event.lastEventId ?? undefined;
      if (eventId && dedup.get(eventId)) {
        return;
      }
      if (eventId) {
        dedup.set(eventId, true);
      }
      try {
        await handler(candidate);
      } catch (err) {
        logger.error({ err }, 'candidate handler failed');
      }
    }
  });
  return () => client.dispose();
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
      let pumpProb = 0.5;
      let pumpSamples = 0;
      try {
        const keywords = extractPumpKeywords(candidate);
        let matched: Array<{ text: string }> = [];
        if (keywords.length > 0) {
          const posts = listRecentSocialPosts(Date.now() - PUMP_KEYWORD_WINDOW_MS);
          matched = posts.filter((post) => textMatchesKeywords(post.text, keywords)).slice(0, 60);
        }
        if (matched.length > 0) {
          const scores = matched.map((post) => scoreText(post.text));
          pumpSamples = scores.length;
          pumpProb = scores.reduce((a, b) => a + b, 0) / pumpSamples;
          pumpInferencesTotal.inc(pumpSamples);
        } else {
          const combined = `${candidate.name ?? ''} ${candidate.symbol ?? ''}`.trim();
          pumpProb = combined ? scoreText(combined) : 0.5;
          pumpInferencesTotal.inc();
        }
        const prev = (rugguardAvgPumpProb as any)._last || { sum: 0, n: 0 };
        const sum = (prev.sum ?? 0) + pumpProb;
        const n = (prev.n ?? 0) + 1;
        (rugguardAvgPumpProb as any)._last = { sum, n };
        rugguardAvgPumpProb.set(sum / Math.max(1, n));
      } catch (err) {
        logger.warn({ err }, 'pump probability calculation failed');
      }
      const verdict = await classify(candidate.mint, { ...candidateToFeatures(candidate), pumpProb }, { connection });
      rugProb = verdict.rugProb;
      insertRugVerdict({ ts: verdict.ts, mint: verdict.mint, rugProb: verdict.rugProb, reasons: [...(verdict.reasons ?? []), `pump_prob:${pumpProb.toFixed(3)}|samples:${pumpSamples}`] });
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

    whaleFlag: holderResult.whaleFlag,
    features: {},
    rugProb
  };

  safetyEvaluations.inc();
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



bootstrap().catch((err) => {
  logger.error({ err }, 'safety engine failed to start');
  process.exit(1);
});
