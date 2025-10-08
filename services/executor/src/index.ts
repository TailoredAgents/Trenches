import 'dotenv/config';
import EventSource from 'eventsource';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry } from '@trenches/metrics';
import { logTradeEvent, recordOrderPlan, recordFill, insertExecOutcome, insertSimOutcome } from '@trenches/persistence';
import { TokenCandidate, OrderPlan, TradeEvent } from '@trenches/shared';
import { WalletProvider } from './wallet';
import { JupiterClient } from './jupiter';
import { TransactionSender } from './sender';
import { ordersReceived, ordersFailed, ordersSubmitted, simpleModeGauge, flagJitoEnabled, flagSecondaryRpcEnabled, flagWsEnabled, landedRateGauge, slipAvgGauge, timeToLandHistogram, retriesTotal, fallbacksTotal, shadowOutcomesTotal } from './metrics';
import { predictFill } from './fillnet';
import { decideFees, updateArm } from './fee-bandit';
import { ExecutorEventBus } from './eventBus';
import { computeWindowStart, loadRouteStats, recordRouteAttempt, markRouteExcluded, RouteQuarantineConfig, RouteStatSnapshot } from './routeQuarantine';
import { applyMigrationPresetAdjustment, MigrationPresetConfig } from './migrationPreset';
import { createRpcConnection, createInMemoryLastEventIdStore, sseQueue, sseRoute, subscribeJsonStream } from '@trenches/util';

const logger = createLogger('executor');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';
const enableShadowOutcomes = process.env.ENABLE_SHADOW_OUTCOMES === '1';
const shadowMode = process.env.EXECUTOR_SHADOW_MODE === '1';
const tokenDecimalsCache = new Map<string, number>();

async function getTokenDecimals(connection: Connection, mint: string): Promise<number> {
  const cached = tokenDecimalsCache.get(mint);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const info = await connection.getParsedAccountInfo(new PublicKey(mint));
    const decimals = Number((info.value as any)?.data?.parsed?.info?.decimals);
    if (Number.isFinite(decimals)) {
      tokenDecimalsCache.set(mint, decimals);
      return decimals;
    }
  } catch (err) {
    logger.warn({ err, mint }, 'failed to fetch token decimals; defaulting to 9');
  }
  tokenDecimalsCache.set(mint, 9);
  return 9;
}
// Replay controls (used only for selecting plan feed in shadow/replay runs)
const useReplay = process.env.USE_REPLAY === '1';
const replayUrl = process.env.SOAK_REPLAY_URL || '';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
// Aggressive execution: More retries for better fills
const MAX_RETRIES = 5;
const ROUTE_QUARANTINE_DEFAULT: RouteQuarantineConfig = {
  windowMinutes: 1440,
  minAttempts: 8,
  failRateThreshold: 0.25,
  slipExcessWeight: 0.5,
  failRateWeight: 100
};

async function bootstrap() {
  const config = loadConfig();
  const jitoBundleUrl = (config.execution as any)?.jito?.bundleUrl ?? '';
  const jitoConfigured = Boolean((config.execution as any)?.jito?.enabled);
  logger.info({ bundleUrl: jitoBundleUrl, enabled: jitoConfigured }, 'executor jito bundle config');
  logger.info({ enableShadowOutcomes, shadowMode }, 'shadow outcomes logger');
  const app = Fastify({ logger: false });
  const bus = new ExecutorEventBus();

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 300,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  let connection: Connection | null = null;
  let wallet: WalletProvider | null = null;
  let jupiter: JupiterClient | null = null;
  let sender: TransactionSender | null = null;
  if (!offline) {
    connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
    wallet = new WalletProvider(connection);
    jupiter = new JupiterClient(connection);
    sender = new TransactionSender(connection);
  } else {
    logger.warn('NO_RPC=1; executor running in offline mode; skipping RPC initialization');
  }

  app.get('/healthz', async () => {
    const walletStatus = wallet?.status ?? { ready: false, reason: offline ? 'offline' : 'missing_keystore' };
    const detail = offline ? 'rpc_missing' : walletStatus.ready ? 'ready' : 'awaiting_credentials';
    return {
      status: !offline && walletStatus.ready ? 'ok' : 'degraded',
      detail,
      offline,
      providersOff,
      rpc: config.rpc.primaryUrl,
      connected: !offline,
      wallet: walletStatus,
      walletPubkey: walletStatus.ready ? wallet?.publicKey.toBase58() : undefined,
      mode: config.execution?.simpleMode ? 'simple' : 'advanced',
      flags: {
        simpleMode: config.execution?.simpleMode ?? true,
        jitoEnabled: config.execution?.jitoEnabled ?? false,
        secondaryRpcEnabled: config.execution?.secondaryRpcEnabled ?? false,
        wsEnabled: config.execution?.wsEnabled ?? false
      }
    };
  });

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });
  app.get('/route-quality', async () => {
    const rqConfig = ((config as any).execution?.routeQuarantine ?? ROUTE_QUARANTINE_DEFAULT) as RouteQuarantineConfig;
    const windowStart = computeWindowStart(Date.now(), rqConfig.windowMinutes);
    const stats = loadRouteStats(rqConfig, windowStart);
    const rows = Array.from(stats.values())
      .map((stat: RouteStatSnapshot) => ({
        route: stat.route,
        attempts: stat.attempts,
        fails: stat.fails,
        failRate: stat.failRate,
        avgSlipRealBps: stat.avgSlipRealBps,
        avgSlipExpBps: stat.avgSlipExpBps,
        penalty: stat.penalty,
        excluded: stat.excluded
      }))
      .sort((a, b) => b.penalty - a.penalty);
    return { windowStart, rows };
  });

  app.get('/events/trades', async (_request, reply) => {
    const stream = sseQueue<TradeEvent>();
    const unsubscribe = bus.onTrade((event) => {
      stream.push(event);
    });
    sseRoute(reply, stream.iterator, () => {
      unsubscribe();
      stream.close();
    });
  });

  app.post('/execute', async (request, reply) => {
    const body = request.body as { plan: OrderPlan; context: { candidate: TokenCandidate } };
    if (!body?.plan) {
      reply.code(400).send({ error: 'missing plan' });
      return;
    }
    if (offline || !connection || !wallet || !jupiter || !sender) {
      reply.code(503).send({ error: 'offline_mode' });
      return;
    }
    if (!wallet.isReady) {
      reply.code(503).send({ error: 'wallet_unavailable' });
      return;
    }
    ordersReceived.inc();
    bus.emitTrade({ t: 'order_plan', plan: body.plan });
    try {
      await executePlan({
        payload: body,
        connection: connection!,
        wallet: wallet!,
        jupiter: jupiter!,
        sender: sender!,
        bus
      });
      reply.code(202).send({ status: 'accepted' });
    } catch (err) {
      logger.error({ err }, 'manual execute failed');
      reply.code(500).send({ error: 'execution_failed' });
    }
  });

  const address = await app.listen({ port: config.services.executor.port, host: '0.0.0.0' });
  logger.info({ address }, 'executor listening');

  // Set execution mode flags in metrics
  try {
    simpleModeGauge.set(config.execution?.simpleMode ? 1 : 0);
    flagJitoEnabled.set(config.execution?.jitoEnabled ? 1 : 0);
    flagSecondaryRpcEnabled.set(config.execution?.secondaryRpcEnabled ? 1 : 0);
    flagWsEnabled.set(config.execution?.wsEnabled ? 1 : 0);
  } catch (err) {
    // Non-fatal: metrics registry unavailable during startup
  }

  const defaultPolicyFeed = `http://127.0.0.1:${config.services.policyEngine.port}/events/plans`;
  const planFeed = useReplay && replayUrl ? replayUrl : defaultPolicyFeed;
  const isUsingReplay = useReplay && replayUrl.length > 0;
  const canSimulateReplay = enableShadowOutcomes && shadowMode && isUsingReplay;
  const mode = config.execution?.simpleMode ? 'simple' : 'advanced';
  logger.info({ planFeed, isUsingReplay, mode }, isUsingReplay ? 'using plan replay feed (shadow)' : 'using policy plan feed');
  let disposer: () => void = () => {};
  const canExecute = !offline && connection && wallet && jupiter && sender;
  if (canExecute || canSimulateReplay) {
    disposer = startPlanStream(planFeed, bus, async (payload) => {
      ordersReceived.inc();
      bus.emitTrade({ t: 'order_plan', plan: payload.plan });
      if (canSimulateReplay && (!wallet || !jupiter || !sender || offline)) {
        try {
          recordReplayShadowOutcome(payload);
        } catch (err) {
          logger.error({ err }, 'failed to record replay shadow outcome');
        }
        return;
      }
      if (!wallet!.isReady && !(enableShadowOutcomes && shadowMode)) {
        logger.warn('wallet unavailable, skipping plan');
        ordersFailed.inc({ stage: 'wallet_unavailable' });
        return;
      }
      try {
        await executePlan({
          payload,
          connection: connection!,
          wallet: wallet!,
          jupiter: jupiter!,
          sender: sender!,
          bus
        });
      } catch (err) {
        ordersFailed.inc({ stage: 'execute' });
        logger.error({ err }, 'failed to execute order plan');
      }
    });
  } else {
    logger.warn('plan stream disabled due to offline mode or missing dependencies');
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'executor shutting down');
    disposer();
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    process.exit(0);
  }
}

function startPlanStream(
  url: string,
  bus: ExecutorEventBus,
  handler: (payload: { plan: OrderPlan; context: { candidate: TokenCandidate } }) => Promise<void>
): () => void {
  const lastEventIdStore = createInMemoryLastEventIdStore();
  const client = subscribeJsonStream<{ plan: OrderPlan; context: { candidate: TokenCandidate } }>(url, {
    lastEventIdStore,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
    onOpen: () => {
      logger.info({ url }, 'connected to policy plan stream');
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt, url }, 'plan stream error');
    },
    onParseError: (err) => {
      logger.error({ err }, 'failed to parse plan payload');
    },
    onMessage: async (payload) => {
      let parsedCtx: Record<string, unknown> | null = null;
      const sourceContext = (payload as any)?.context;
      if (sourceContext && typeof sourceContext.ctx_json === 'string') {
        try {
          parsedCtx = JSON.parse(sourceContext.ctx_json || '{}');
        } catch (err) {
          logger.warn({ err }, 'bad ctx_json from plan payload');
        }
      }
      if (parsedCtx && payload.context && typeof payload.context === 'object') {
        (payload.context as any).parsedCtx = parsedCtx;
      }
      bus.emitTrade({ t: 'order_plan', plan: payload.plan });
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err }, 'plan handler failed');
      }
    }
  });
  return () => client.dispose();
}

function recordReplayShadowOutcome(payload: { plan: OrderPlan; context: { candidate: TokenCandidate } }) {
  const { plan, context } = payload;
  const candidate = context?.candidate ?? ({} as TokenCandidate);
  const now = Date.now();
  const amountIn = typeof (plan as any).inAmount === 'number'
    ? Number((plan as any).inAmount)
    : Math.max(0, Math.round((plan.sizeSol ?? 0) * 1_000_000_000));
  const amountOut = typeof (plan as any).outAmount === 'number'
    ? Number((plan as any).outAmount)
    : 0;
  const quotePrice = amountIn > 0 ? amountOut / amountIn : 0;
  insertSimOutcome({
    ts: now,
    mint: candidate?.mint ?? null,
    route: plan.route ?? 'replay',
    filled: 1,
    quote_price: quotePrice,
    exec_price: quotePrice,
    slippageReq: (plan as any).slippageBps ?? null,
    slippageReal: (plan as any).slippageBps ?? null,
    timeToLandMs: 1000,
    cu_price: (plan as any).cuPrice ?? null,
    amountIn,
    amountOut,
    source: 'shadow_replay'
  });
  shadowOutcomesTotal.inc({ result: 'ok' });
}

async function executePlan(opts: {
  payload: { plan: OrderPlan; context: { candidate: TokenCandidate } };
  connection: Connection;
  wallet: WalletProvider;
  jupiter: JupiterClient;
  sender: TransactionSender;
  bus: ExecutorEventBus;
}): Promise<void> {
  const { payload, wallet, jupiter, sender, bus, connection } = opts;
  const plan = payload.plan;
  const candidate = payload.context.candidate;
  const orderCreatedTs = Date.now();
  const orderId = `${candidate.mint}-${orderCreatedTs}`;

  recordOrderPlan({
    id: orderId,
    mint: candidate.mint,
    gate: plan.gate,
    sizeSol: plan.sizeSol,
    slippageBps: plan.slippageBps,
    jitoTipLamports: plan.jitoTipLamports,
    computeUnitPrice: plan.computeUnitPriceMicroLamports,
    route: plan.route,
    status: 'PENDING',
    side: plan.side ?? 'buy',
    tokenAmount: plan.tokenAmountLamports ?? null,
    expectedSol: plan.expectedSol ?? null,
    createdTs: orderCreatedTs
  });

  const isBuy = (plan.side ?? 'buy') === 'buy';
  let amountLamports: number;
  let inputMint: string;
  let outputMint: string;
  if (isBuy) {
    amountLamports = Math.round(plan.sizeSol * 1_000_000_000);
    if (amountLamports <= 0) {
      throw new Error('invalid amount');
    }
    inputMint = SOL_MINT;
    outputMint = candidate.mint;
  } else {
    amountLamports = plan.tokenAmountLamports ?? 0;
    if (amountLamports <= 0) {
      throw new Error('invalid sell amount');
    }
    inputMint = candidate.mint;
    outputMint = SOL_MINT;
  }

  // ExecutionPolicy: choose fees/slippage
  const cfg = loadConfig();
  const arms = cfg.execution.feeArms;
  const routeKey = plan.route ?? 'jupiter';
  const rqConfig = ((cfg as any).execution?.routeQuarantine ?? ROUTE_QUARANTINE_DEFAULT) as RouteQuarantineConfig;
  const windowStartTs = computeWindowStart(Date.now(), rqConfig.windowMinutes);
  const routeStatsMap = loadRouteStats(rqConfig, windowStartTs);
  const excludedRoutes = new Set<string>();
  const eligible = [] as Array<{ cuPrice: number; slippageBps: number; pred: { pFill: number; expSlipBps: number; expTimeMs: number }; penalty: number }>;
  for (const arm of arms) {
    const currentStats = routeStatsMap.get(routeKey);
    if (currentStats?.excluded) {
      if (!excludedRoutes.has(routeKey)) {
        excludedRoutes.add(routeKey);
        markRouteExcluded(routeKey);
      }
      continue;
    }
    if (!cfg.features.feeBandit || !cfg.features.fillNet) {
      eligible.push({ cuPrice: arm.cuPrice, slippageBps: arm.slippageBps, pred: { pFill: 1, expSlipBps: arm.slippageBps, expTimeMs: 500 }, penalty: currentStats?.penalty ?? 0 });
      continue;
    }
    const pred = await predictFill({
      route: routeKey,
      amountLamports,
      slippageBps: arm.slippageBps,
      congestionScore: 0.7,
      lpSol: candidate.lpSol,
      spreadBps: candidate.spreadBps,
      volatilityBps: candidate.spreadBps,
      ageSec: candidate.ageSec,
      rugProb: (candidate as any).rugProb
    }, { mint: candidate.mint, arm });
    if (pred.pFill >= cfg.execution.minFillProb && arm.slippageBps <= cfg.execution.maxSlipBps) {
      eligible.push({ cuPrice: arm.cuPrice, slippageBps: arm.slippageBps, pred, penalty: currentStats?.penalty ?? 0 });
    }
  }
  if (eligible.length === 0) {
    if (!excludedRoutes.has(routeKey)) {
      excludedRoutes.add(routeKey);
      markRouteExcluded(routeKey);
    }
    throw new Error(`route ${routeKey} quarantined`);
  }
  const chosen = eligible.sort((a, b) => (b.pred.pFill - b.penalty) - (a.pred.pFill - a.penalty))[0];
  const feeDecision = cfg.features.feeBandit ? decideFees({ congestionScore: 0.7, sizeSol: plan.sizeSol, equity: plan.sizeSol * 10, lpSol: candidate.lpSol, spreadBps: candidate.spreadBps }) : { ts: Date.now(), cuPrice: chosen.cuPrice, cuLimit: 1_200_000, slippageBps: chosen.slippageBps, rationale: 'static' };
  // Shadow fee policy (offline only)
  try {
    if ((cfg as any).features?.offlinePolicyShadow) {
      const arms = cfg.execution.feeArms;
      const baselineIndex = arms.findIndex((a) => a.cuPrice === feeDecision.cuPrice && a.slippageBps === feeDecision.slippageBps);
      // Simple conservative shadow: pick lowest slippage arm
      const shadowIndex = 0;
      const shadowArm = arms[shadowIndex] ?? arms[0];
      const pChosen = chosen.pred?.pFill ?? 1;
      const shadowPred = await predictFill({ route: 'jupiter', amountLamports, slippageBps: shadowArm.slippageBps, congestionScore: 0.7, lpSol: candidate.lpSol, spreadBps: candidate.spreadBps, volatilityBps: candidate.spreadBps, ageSec: candidate.ageSec, rugProb: (candidate as any).rugProb }, { mint: candidate.mint, arm: shadowArm });
      const delta = (shadowPred.pFill ?? 0) - (pChosen ?? 0);
      const { insertShadowFeeDecision } = await import('@trenches/persistence');
      insertShadowFeeDecision({ ts: Date.now(), mint: candidate.mint, chosenArm: shadowIndex, baselineArm: baselineIndex, deltaRewardEst: delta }, { baseline: { cuPrice: feeDecision.cuPrice, slippageBps: feeDecision.slippageBps }, shadow: shadowArm });
    }
  } catch (err) {
    logger.error({ err }, 'failed to record shadow fee decision');
  }

  let slippageToUse = feeDecision.slippageBps;
  let cuPriceToUse = feeDecision.cuPrice;
  let slipExpForStats = chosen.pred?.expSlipBps ?? slippageToUse;

  const presetConfig = ((cfg as any).execution?.migrationPreset ?? {
    enabled: true,
    durationMs: 60000,
    cuPriceBump: 3000,
    minSlippageBps: 100,
    decayMs: 30000
  }) as MigrationPresetConfig;

  const presetResult = applyMigrationPresetAdjustment({
    preset: presetConfig,
    mint: candidate.mint,
    pool: candidate.poolAddress ?? candidate.lpMint ?? null,
    route: plan.route,
    baseCuPrice: cuPriceToUse,
    baseSlippageBps: slippageToUse
  });

  cuPriceToUse = presetResult.cuPrice;
  slippageToUse = presetResult.slippageBps;
  slipExpForStats = Math.max(slipExpForStats, slippageToUse);
  const quote = await jupiter.fetchQuote(
    {
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps: slippageToUse
    },
    wallet.publicKey.toBase58()
  );

  const tokenDecimals = await getTokenDecimals(connection, candidate.mint);
  const quoteOutRaw = Number(quote.outAmount);
  const quotePrice = computeExecutionPrice({
    tokenDecimals,
    solAmountLamports: isBuy ? amountLamports : quoteOutRaw,
    tokenAmountRaw: isBuy ? quoteOutRaw : amountLamports
  });

  // In shadow mode, record synthetic outcome and skip real execution
  try {
    if (enableShadowOutcomes && shadowMode) {
      const isBuyShadow = isBuy;
      const execPriceShadow = quotePrice > 0 ? quotePrice : 0;
      const slipRealShadow = 0; // without simulation/realized, default 0
      const ttlShadow = chosen.pred?.expTimeMs ?? 1200;
      insertSimOutcome({
        ts: Math.floor(Date.now()),
        mint: candidate.mint,
        route: plan.route ?? 'jupiter',
        filled: 1,
        quote_price: quotePrice,
        exec_price: execPriceShadow,
        slippageReq: slippageToUse,
        slippageReal: slipRealShadow,
        timeToLandMs: ttlShadow,
        cu_price: cuPriceToUse,
        amountIn: amountLamports,
        amountOut: quoteOutRaw,
        source: 'shadow'
      });
      shadowOutcomesTotal.inc({ result: 'ok' });
      // Mark plan as observed in logs and return without sending
      logger.info({ mint: candidate.mint, route: plan.route, amountLamports, quoteOut: quoteOutRaw }, 'shadow outcome recorded; skipping execution');
      return;
    }
  } catch (err) {
    shadowOutcomesTotal.inc({ result: 'err' });
    logger.warn({ err }, 'failed to record shadow outcome');
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const { transaction, prioritizationFeeLamports } = await jupiter.buildSwapTx({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        computeUnitPriceMicroLamports: cuPriceToUse
      });

      transaction.sign([wallet.keypairInstance]);
      const jitoTipLamports = plan.jitoTipLamports ?? 0;
      let tipTxBase64: string | null = null;
      if (jitoTipLamports > 0) {
        const tipAccount = cfg.rpc.jitoTipAccount ?? '';
        if (tipAccount) {
          try {
            const tipTx = new Transaction();
            tipTx.recentBlockhash = transaction.message.recentBlockhash;
            tipTx.feePayer = wallet.publicKey;
            tipTx.add(
              SystemProgram.transfer({
                fromPubkey: wallet.publicKey,
                toPubkey: new PublicKey(tipAccount),
                lamports: jitoTipLamports
              })
            );
            tipTx.sign(wallet.keypairInstance);
            tipTxBase64 = tipTx.serialize().toString('base64');
          } catch (err) {
            logger.warn({ err, mint: candidate.mint }, 'failed to build jito tip transaction');
          }
        } else {
          logger.warn({ mint: candidate.mint }, 'jitoTipLamports set but rpc.jitoTipAccount missing');
        }
      }

      const appliedTipLamports = tipTxBase64 ? plan.jitoTipLamports ?? 0 : 0;
      const tSend = Date.now();
      const { signature, slot } = await sender.sendAndConfirm({
        transaction,
        jitoTipLamports: plan.jitoTipLamports,
        jitoTipTxBase64: tipTxBase64,
        computeUnitPriceMicroLamports: plan.computeUnitPriceMicroLamports,
        label: orderId
      });

      let quantityRaw = isBuy ? quoteOutRaw : amountLamports;
      let amountInUsed = amountLamports;
      let amountOutUsed = isBuy ? quantityRaw : quoteOutRaw;
      let execPrice = quotePrice;
      let slipReal = 0;

      try {
        const txResult = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (txResult?.meta) {
          const walletAddress = wallet.publicKey.toBase58();
          const tokenDelta = diffTokenBalance(txResult.meta, candidate.mint, walletAddress);
          if (isBuy) {
            if (tokenDelta.delta > 0) {
              quantityRaw = tokenDelta.delta;
              amountOutUsed = tokenDelta.delta;
              execPrice = computeExecutionPrice({
                tokenDecimals,
                solAmountLamports: amountInUsed,
                tokenAmountRaw: amountOutUsed
              });
            }
          } else {
            if (tokenDelta.delta !== 0) {
              amountInUsed = Math.abs(tokenDelta.delta);
              quantityRaw = amountInUsed;
            }
            const solDelta = diffSolBalance(txResult.meta);
            if (solDelta > 0) {
              amountOutUsed = solDelta;
              execPrice = computeExecutionPrice({
                tokenDecimals,
                solAmountLamports: amountOutUsed,
                tokenAmountRaw: amountInUsed
              });
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, 'failed to compute realized slip');
      }

      if (!Number.isFinite(execPrice) || execPrice <= 0) {
        execPrice = quotePrice;
      }
      slipReal = quotePrice > 0 ? ((execPrice - quotePrice) / quotePrice) * 10_000 : 0;
      if (!Number.isFinite(slipReal)) {
        slipReal = 0;
      }
      if (!Number.isFinite(amountOutUsed) || amountOutUsed < 0) {
        amountOutUsed = isBuy ? quantityRaw : quoteOutRaw;
      }
      if (!Number.isFinite(amountInUsed) || amountInUsed <= 0) {
        amountInUsed = amountLamports;
      }

      const t0 = Date.now();
      recordFill({
        signature,
        mint: candidate.mint,
        price: execPrice,
        quantity: quantityRaw,
        route: plan.route,
        tipLamports: plan.jitoTipLamports,
        slot
      });
      const fillEvent: TradeEvent = {
        t: 'fill',
        mint: candidate.mint,
        sig: signature,
        px: execPrice,
        qty: quantityRaw,
        route: plan.route,
        tip: plan.jitoTipLamports,
        slot,
        side: plan.side ?? 'buy'
      };
      logTradeEvent(fillEvent);
      const ttl = Date.now() - tSend;
      const feeLamportsTotal = (prioritizationFeeLamports ?? 0) + appliedTipLamports;
      const amountIn = amountInUsed;
      const amountOut = amountOutUsed;
      insertExecOutcome({
        ts: t0,
        quotePrice,
        execPrice,
        filled: 1,
        route: plan.route,
        cuPrice: cuPriceToUse,
        slippageReq: slippageToUse,
        slippageReal: slipReal,
        timeToLandMs: ttl,
        errorCode: null,
        notes: null,
        priorityFeeLamports: prioritizationFeeLamports ?? 0,
        amountIn,
        amountOut,
        feeLamportsTotal,
        orderId,
        mint: candidate.mint,
        side: plan.side ?? 'buy'
      });
      bus.emitTrade(fillEvent);
      recordOrderPlan({
        id: orderId,
        mint: candidate.mint,
        gate: plan.gate,
        sizeSol: plan.sizeSol,
        slippageBps: plan.slippageBps,
        jitoTipLamports: plan.jitoTipLamports,
        computeUnitPrice: plan.computeUnitPriceMicroLamports,
        route: plan.route,
        status: 'FILLED',
        side: plan.side ?? 'buy',
        tokenAmount: plan.tokenAmountLamports ?? null,
        expectedSol: plan.expectedSol ?? null,
        createdTs: orderCreatedTs
      });
      try {
        landedRateGauge.set(1);
        slipAvgGauge.set(slipReal);
        timeToLandHistogram.set(ttl);
      } catch (err) {
        logger.error({ err }, 'failed to set execution gauges');
      }
      const feeBaseLamports = isBuy ? amountInUsed : amountOutUsed;
      const feeBps = feeBaseLamports > 0 ? (feeLamportsTotal / feeBaseLamports) * 10_000 : 0;
      try {
        updateArm(
          { congestionScore: 0.7, sizeSol: plan.sizeSol, equity: plan.sizeSol * 10, lpSol: candidate.lpSol, spreadBps: candidate.spreadBps },
          { cuPrice: cuPriceToUse, slippageBps: slippageToUse },
          { filled: true, realizedSlipBps: slipReal, feeBps }
        );
      } catch (err) {
        logger.error({ err }, 'failed to update fee bandit arm');
      }
      const successStats = recordRouteAttempt({
        config: rqConfig,
        route: routeKey,
        windowStartTs,
        success: true,
        slipRealBps: slipReal,
        slipExpBps: slipExpForStats
      });
      routeStatsMap.set(routeKey, successStats);
      return;
    } catch (err) {
      lastError = err;
      logger.error({ err, attempt }, 'execution attempt failed');
      retriesTotal.inc();
      if (attempt < MAX_RETRIES - 1) {
        fallbacksTotal.inc();
      }
      const failureStats = recordRouteAttempt({
        config: rqConfig,
        route: routeKey,
        windowStartTs,
        success: false,
        slipRealBps: slippageToUse,
        slipExpBps: slipExpForStats
      });
      routeStatsMap.set(routeKey, failureStats);
      if (failureStats.excluded && !excludedRoutes.has(routeKey)) {
        excludedRoutes.add(routeKey);
        markRouteExcluded(routeKey);
        const quarantineError = new Error(`route ${routeKey} quarantined after failures`);
        lastError = quarantineError;
        throw quarantineError;
      }
    }
  }
  recordOrderPlan({
    id: orderId,
    mint: candidate.mint,
    gate: plan.gate,
    sizeSol: plan.sizeSol,
    slippageBps: plan.slippageBps,
    jitoTipLamports: plan.jitoTipLamports,
    computeUnitPrice: plan.computeUnitPriceMicroLamports,
    route: plan.route,
    status: 'FAILED',
    side: plan.side ?? 'buy',
    tokenAmount: plan.tokenAmountLamports ?? null,
    expectedSol: plan.expectedSol ?? null,
    createdTs: orderCreatedTs
  });
  insertExecOutcome({
    ts: Date.now(),
    quotePrice: 0,
    execPrice: null,
    filled: 0,
    route: plan.route,
    cuPrice: cuPriceToUse,
    slippageReq: slippageToUse,
    slippageReal: null,
    timeToLandMs: null,
    errorCode: (lastError as any)?.message ?? 'unknown',
    notes: 'failed',
    orderId,
    mint: candidate.mint,
    side: plan.side ?? 'buy'
  });
  throw lastError instanceof Error ? lastError : new Error('execution failed');
}


function diffTokenBalance(meta: any, mint: string, owner: string): { delta: number; decimals: number } {
  const findEntry = (list: any[]) => list?.find((entry) => entry?.mint === mint && entry?.owner === owner);
  const pre = findEntry(meta?.preTokenBalances ?? []);
  const post = findEntry(meta?.postTokenBalances ?? []);
  const preAmount = pre ? Number(pre.uiTokenAmount?.amount ?? pre.amount ?? 0) : 0;
  const postAmount = post ? Number(post.uiTokenAmount?.amount ?? post.amount ?? 0) : 0;
  const decimals = post?.uiTokenAmount?.decimals ?? pre?.uiTokenAmount?.decimals ?? 0;
  return { delta: postAmount - preAmount, decimals };
}

function diffSolBalance(meta: any): number {
  const preBalances = Array.isArray(meta?.preBalances) ? meta.preBalances : [];
  const postBalances = Array.isArray(meta?.postBalances) ? meta.postBalances : [];
  const pre = preBalances.length > 0 ? preBalances[0] ?? 0 : 0;
  const post = postBalances.length > 0 ? postBalances[0] ?? 0 : 0;
  return post - pre;
}

function computeExecutionPrice(params: { tokenDecimals: number; solAmountLamports: number; tokenAmountRaw: number }): number {
  const { tokenDecimals, solAmountLamports, tokenAmountRaw } = params;
  const solAmount = solAmountLamports / LAMPORTS_PER_SOL;
  const tokenDivisor = 10 ** tokenDecimals;
  const tokenAmount = tokenDivisor > 0 ? tokenAmountRaw / tokenDivisor : 0;
  if (solAmount <= 0 || tokenAmount <= 0) {
    return 0;
  }
  return solAmount / tokenAmount;
}

bootstrap().catch((err) => {
  logger.error({ err }, 'executor failed to start');
});
