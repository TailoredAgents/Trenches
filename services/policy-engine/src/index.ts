import 'dotenv/config';
import EventSource from 'eventsource';
import { createSSEClient, createInMemoryLastEventIdStore } from '@trenches/util';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { Connection } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerGauge } from '@trenches/metrics';
import { logTradeEvent, getDailyRealizedPnlSince, recordPolicyAction } from '@trenches/persistence';
import { TokenCandidate, TradeEvent, CongestionLevel, OrderPlan } from '@trenches/shared';
import { PolicyEventBus } from './eventBus';
import { plansEmitted, plansSuppressed, sizingDurationMs, walletEquityGauge, walletFreeGauge, banditRewardGauge } from './metrics';
import { pickTipLamports } from './tip';
import { pickSlippageBps } from './slippage';
import { getCongestionLevel } from './network';
import { buildContext } from './context';
import { LinUCBBandit } from './bandit';
import { WalletManager } from './wallet';
import { computeSizing } from './sizing';
import { chooseSize } from './sizing_constrained';
import { PlanEnvelope } from './types';
import { createRpcConnection } from '@trenches/util';

const logger = createLogger('policy-engine');
const PLAN_FEATURE_DIM = 8;
const WALLET_REFRESH_MS = 5_000;
const CONGESTION_REFRESH_MS = 3_000;

const lastWalletGaugeRefresh = registerGauge({
  name: 'policy_wallet_last_refresh_epoch',
  help: 'Unix timestamp of last wallet refresh'
});

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new PolicyEventBus();

  const connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  const walletManager = new WalletManager(connection);
  const walletReady = walletManager.isReady;
  const bandit = new LinUCBBandit(PLAN_FEATURE_DIM);

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 240,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  let lastWalletRefresh = 0;
  let lastCongestionRefresh = 0;
  let cachedCongestionLevel: CongestionLevel = 'p50';
  let cachedCongestionScore = 0.5;

  const refreshWallet = async () => {
    const now = Date.now();
    if (now - lastWalletRefresh < WALLET_REFRESH_MS && walletManager.snapshot) {
      return walletManager.snapshot;
    }
    const snapshot = await walletManager.refresh();
    walletEquityGauge.set(snapshot.equity);
    walletFreeGauge.set(snapshot.free);
    lastWalletGaugeRefresh.set(Date.now());
    lastWalletRefresh = now;
    return snapshot;
  };

  const refreshCongestion = async (): Promise<{ level: CongestionLevel; score: number }> => {
    const now = Date.now();
    if (now - lastCongestionRefresh < CONGESTION_REFRESH_MS) {
      return { level: cachedCongestionLevel, score: cachedCongestionScore };
    }
    const level = await getCongestionLevel(connection);
    cachedCongestionLevel = level;
    cachedCongestionScore = congestionToScore(level);
    lastCongestionRefresh = now;
    return { level, score: cachedCongestionScore };
  };

  app.get('/healthz', async () => ({
    status: 'ok',
    rpc: config.rpc.primaryUrl,
    wallet: walletReady ? 'ready' : 'missing_keystore',
    safeFeed: config.policy.safeFeedUrl ?? `http://127.0.0.1:${config.services.safetyEngine.port}/events/safe`
  }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/snapshot', async () => ({
    wallet: walletManager.snapshot,
    congestion: cachedCongestionLevel
  }));

  app.get('/events/plans', async (request, reply) => {
    const { iterator, close } = createIterator(bus);
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  const address = await app.listen({ port: config.services.policyEngine.port, host: '0.0.0.0' });
  logger.info({ address }, 'policy engine listening');

  const safeFeedUrl = config.policy.safeFeedUrl ?? `http://127.0.0.1:${config.services.safetyEngine.port}/events/safe`;
  const alphaTopK = (config as any).alpha?.topK ?? 12;
  const alphaMin = (config as any).alpha?.minScore ?? 0.52;
  const alphaMap = new Map<string, number>();
  const disposeStream = startCandidateStream(safeFeedUrl, async (candidate) => {
    try {
      if ((config as any).features?.alphaRanker) {
        const { getDb } = await import('@trenches/persistence');
        const db = getDb();
        const row = db.prepare('SELECT score FROM scores WHERE mint = ? AND horizon = ? ORDER BY ts DESC LIMIT 1').get(candidate.mint, '10m') as { score?: number } | undefined;
        const sc = row?.score ?? 0;
        alphaMap.set(candidate.mint, sc);
        if (sc < alphaMin) {
          plansSuppressed.inc({ reason: 'alpha_below_min' });
          return;
        }
        // Keep only topK by score at decision time
        const arr = Array.from(alphaMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0, alphaTopK).map(([m])=>m);
        if (!arr.includes(candidate.mint)) {
          plansSuppressed.inc({ reason: 'alpha_not_topk' });
          return;
        }
      }
    } catch {}
    if (typeof (candidate as any).rugProb === 'number') {
      const rugProb = (candidate as any).rugProb as number;
      if (rugProb > 0.6) {
        plansSuppressed.inc({ reason: 'rugprob_high' });
        return;
      }
    }
    if (!candidate.safety?.ok) {
      plansSuppressed.inc({ reason: 'safety_not_ok' });
      return;
    }
    if (candidate.ocrs < config.policy.minOcrs) {
      plansSuppressed.inc({ reason: 'ocrs_below_policy' });
      return;
    }

    if (!walletReady) {
      plansSuppressed.inc({ reason: 'wallet_unavailable' });
      return;
    }

    const walletSnapshot = await refreshWallet();
    if (walletSnapshot.spendRemaining <= 0) {
      plansSuppressed.inc({ reason: 'daily_cap_exhausted' });
      return;
    }

    const sinceMidnight = new Date();
    sinceMidnight.setUTCHours(0, 0, 0, 0);
    const realizedPnl = getDailyRealizedPnlSince(sinceMidnight.toISOString());
    if (realizedPnl < 0 && Math.abs(realizedPnl) >= config.policy.dailyLossCapPct * walletSnapshot.equity) {
      plansSuppressed.inc({ reason: 'daily_loss_cap' });
      return;
    }

    const { level: congestionLevel, score: congestionScore } = await refreshCongestion();
    const contextVector = buildContext(candidate, {
      congestionScore,
      walletEquity: walletSnapshot.equity
    });

    const selection = bandit.select(contextVector);
    const sizingStart = Date.now();
    const sizing = (config.features?.constrainedSizing
      ? (() => {
          const dec = chooseSize({ candidate, walletEquity: walletSnapshot.equity, walletFree: walletSnapshot.free, dailySpendUsed: walletSnapshot.spendUsed, caps: { perNameFraction: 0.3, perNameMaxSol: 5, dailySpendCapSol: walletSnapshot.spendCap ?? walletSnapshot.equity } });
          return { size: dec.notional, reason: 'ok' } as { size: number; reason: string };
        })()
      : computeSizing(candidate, walletSnapshot, selection.action.sizeMultiplier));

    // Shadow sizing policy (offline)
    try {
      if ((config as any).features?.offlinePolicyShadow) {
        const arms = ((config as any).sizing?.arms ?? []).map((a: any) => `${a.type}:${a.value}`);
        const baselineArm = arms.find((a) => sizing.size >= 0) ?? (arms[0] ?? 'equity_frac:0.005');
        const shadowArm = arms[0] ?? baselineArm;
        const { insertShadowSizingDecision } = await import('@trenches/persistence');
        insertShadowSizingDecision({ ts: Date.now(), mint: candidate.mint, chosenArm: shadowArm, baselineArm, deltaRewardEst: 0 }, { ctx: { walletEquity: walletSnapshot.equity } });
      }
    } catch {}
    sizingDurationMs.set(Date.now() - sizingStart);

    if (sizing.size <= 0) {
      plansSuppressed.inc({ reason: sizing.reason });
      return;
    }

    const slippageBps = pickSlippageBps(candidate.ageSec, selection.action.slippageBps);
    const tipLamports = pickTipLamports(selection.action.tipPercentile);

    const plan: OrderPlan = {
      mint: candidate.mint,
      gate: selection.action.gate,
      route: 'jupiter',
      sizeSol: Number(sizing.size.toFixed(4)),
      slippageBps,
      jitoTipLamports: tipLamports,
      side: 'buy' as const
    };

    const orderPlan: PlanEnvelope = {
      plan,
      context: {
        candidate,
        congestion: congestionLevel,
        walletEquity: walletSnapshot.equity,
        walletFree: walletSnapshot.free,
        dailySpendUsed: walletSnapshot.spendUsed
      },
      selection
    };

    plansEmitted.inc();
    const reward = candidate.ocrs;
    const smoothing = config.policy.rewardSmoothing;
    const blendedReward = reward * (1 - smoothing) + selection.expectedReward * smoothing;
    bandit.update(selection.action.id, contextVector, blendedReward);
    banditRewardGauge.set(reward);

    bus.emitPlan(orderPlan);

    recordPolicyAction({
      actionId: selection.action.id,
      mint: candidate.mint,
      context: orderPlan.context,
      parameters: { plan, selection },
      reward
    });

    const tradeEvent: TradeEvent = { t: 'order_plan', plan };
    logTradeEvent(tradeEvent);
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down policy engine');
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed closing fastify');
    }
    try {
      disposeStream();
    } catch (err) {
      logger.error({ err }, 'failed to close candidate stream');
    }
    process.exit(0);
  }
}

type StreamHandler = (candidate: TokenCandidate) => void | Promise<void>;

type StreamDisposer = () => void;

function startCandidateStream(url: string, handler: StreamHandler): StreamDisposer {
  const store = createInMemoryLastEventIdStore();
  const client = createSSEClient(url, {
    lastEventIdStore: store,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }),
    onOpen: () => {
      logger.info({ url }, 'policy engine connected to candidate stream');
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt }, 'candidate stream error, reconnecting');
    },
    onEvent: async (event) => {
      if (!event?.data || event.data === 'ping') {
        return;
      }
      try {
        const candidate = JSON.parse(event.data) as TokenCandidate;
        await handler(candidate);
      } catch (err) {
        logger.error({ err }, 'failed to parse candidate event');
      }
    }
  });
  return () => client.dispose();
}

function createIterator(bus: PolicyEventBus): { iterator: AsyncGenerator<{ data: string }>; close: () => void } {
  const queue: Array<{ data: string }> = [];
  let notify: (() => void) | undefined;

  const unsubscribe = bus.onPlan((plan) => {
    queue.push({ data: JSON.stringify(plan) });
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
}

function congestionToScore(level: string): number {
  switch (level) {
    case 'p25':
      return 1;
    case 'p50':
      return 0.7;
    case 'p75':
      return 0.4;
    case 'p90':
      return 0.2;
    default:
      return 0.5;
  }
}

bootstrap().catch((err) => {
  logger.error({ err }, 'policy engine failed to start');
  process.exit(1);
});
