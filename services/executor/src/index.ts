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
import { logTradeEvent, recordOrderPlan, recordFill, insertExecOutcome } from '@trenches/persistence';
import { TokenCandidate, OrderPlan, TradeEvent } from '@trenches/shared';
import { WalletProvider } from './wallet';
import { JupiterClient } from './jupiter';
import { TransactionSender } from './sender';
import { ordersReceived, ordersFailed, ordersSubmitted, simpleModeGauge, flagJitoEnabled, flagSecondaryRpcEnabled, flagWsEnabled, landedRateGauge, slipAvgGauge, timeToLandHistogram, retriesTotal, fallbacksTotal, migrationPresetActive, migrationPresetUses, routePenaltyGauge } from './metrics';
import { predictFill } from './fillnet';
import { decideFees, updateArm } from './fee-bandit';
import { ExecutorEventBus } from './eventBus';
import { createRpcConnection, createSSEClient, createInMemoryLastEventIdStore } from '@trenches/util';

const logger = createLogger('executor');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const MAX_RETRIES = 3;

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new ExecutorEventBus();

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 300,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  const connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  const wallet = new WalletProvider(connection);
  const jupiter = new JupiterClient(connection);
  const sender = new TransactionSender(connection);

  app.get('/healthz', async () => ({
    status: 'ok',
    rpc: config.rpc.primaryUrl,
    connected: true,
    mode: config.execution?.simpleMode ? 'simple' : 'advanced',
    flags: {
      simpleMode: config.execution?.simpleMode ?? true,
      jitoEnabled: config.execution?.jitoEnabled ?? false,
      secondaryRpcEnabled: config.execution?.secondaryRpcEnabled ?? false,
      wsEnabled: config.execution?.wsEnabled ?? false
    }
  }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/events/trades', async (request, reply) => {
    const { iterator, close } = createTradeIterator(bus);
    reply.sse(iterator);
    request.raw.on('close', close);
    request.raw.on('error', close);
  });

  app.post('/execute', async (request, reply) => {
    const body = request.body as { plan: OrderPlan; context: { candidate: TokenCandidate } };
    if (!body?.plan) {
      reply.code(400).send({ error: 'missing plan' });
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
        connection,
        wallet,
        jupiter,
        sender,
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

  const planFeed = `http://127.0.0.1:${config.services.policyEngine.port}/events/plans`;
  const disposer = startPlanStream(planFeed, bus, async (payload) => {
    ordersReceived.inc();
    bus.emitTrade({ t: 'order_plan', plan: payload.plan });
    if (!wallet.isReady) {
      logger.warn('wallet unavailable, skipping plan');
      ordersFailed.inc({ stage: 'wallet_unavailable' });
      return;
    }
    try {
      await executePlan({
        payload,
        connection,
        wallet,
        jupiter,
        sender,
        bus
      });
    } catch (err) {
      ordersFailed.inc({ stage: 'execute' });
      logger.error({ err }, 'failed to execute order plan');
    }
  });

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
  const client = createSSEClient(url, {
    lastEventIdStore,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }),
    onOpen: () => {
      logger.info({ url }, 'connected to policy plan stream');
    },
    onEvent: async (event) => {
      if (!event?.data || event.data === 'ping') {
        return;
      }
      let payload: { plan: OrderPlan; context: { candidate: TokenCandidate } };
      try {
        payload = JSON.parse(event.data) as { plan: OrderPlan; context: { candidate: TokenCandidate } };
      } catch (err) {
        logger.error({ err }, 'failed to parse plan payload');
        return;
      }
      bus.emitTrade({ t: 'order_plan', plan: payload.plan });
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err }, 'plan handler failed');
      }
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt, url }, 'plan stream error');
    }
  });
  return () => {
    client.dispose();
  };
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
  const orderId = `${candidate.mint}-${Date.now()}`;

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
    expectedSol: plan.expectedSol ?? null
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
  const eligible = [] as Array<{ cuPrice: number; slippageBps: number; pred: { pFill: number; expSlipBps: number; expTimeMs: number } }>;  
  for (const arm of arms) {
    if (!cfg.features.feeBandit || !cfg.features.fillNet) {
      eligible.push({ cuPrice: arm.cuPrice, slippageBps: arm.slippageBps, pred: { pFill: 1, expSlipBps: arm.slippageBps, expTimeMs: 500 } });
      continue;
    }
    const pred = await predictFill({
      route: 'jupiter',
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
      eligible.push({ cuPrice: arm.cuPrice, slippageBps: arm.slippageBps, pred });
    }
  }
  const routeStats = (global as any).__route_stats ?? ((global as any).__route_stats = new Map<string, { attempts:number; fails:number; avgSlip:number; penalty:number }>());
  const routeKey = 'jupiter';
  const chosen = eligible.length > 0 ? eligible.sort((a, b) => (b.pred.pFill - (routeStats.get(routeKey)?.penalty ?? 0)) - (a.pred.pFill - (routeStats.get(routeKey)?.penalty ?? 0)))[0] : { cuPrice: 0, slippageBps: plan.slippageBps ?? 100, pred: { pFill: 1, expSlipBps: 100, expTimeMs: 500 } };
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
  } catch {}

  let slippageToUse = feeDecision.slippageBps;
  let cuPriceToUse = feeDecision.cuPrice;
  try {
    const preset = (cfg as any).execution?.migrationPreset ?? { enabled: true, durationMs: 60000, decayMs: 30000, cuPriceBump: 3000, minSlippageBps: 100 };
    if (preset.enabled) {
      const ageMs = Math.max(0, (candidate.ageSec ?? 9999) * 1000);
      let bump = 0; let minSlip = 0;
      if (ageMs <= preset.durationMs) {
        bump = preset.cuPriceBump; minSlip = preset.minSlippageBps; migrationPresetActive.set(1);
      } else if (ageMs <= preset.durationMs + preset.decayMs) {
        const f = 1 - (ageMs - preset.durationMs) / Math.max(1, preset.decayMs);
        bump = Math.round(preset.cuPriceBump * f); minSlip = Math.round(preset.minSlippageBps * f); migrationPresetActive.set(1);
      } else {
        migrationPresetActive.set(0);
      }
      if (bump > 0 || minSlip > 0) {
        cuPriceToUse = cuPriceToUse + bump;
        slippageToUse = Math.max(slippageToUse, minSlip);
        migrationPresetUses.inc();
      }
    }
  } catch {}

  const quote = await jupiter.fetchQuote(
    {
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps: slippageToUse
    },
    wallet.publicKey.toBase58()
  );

  const quotePrice = computeExecutionPrice({
    isBuy,
    sizeSol: plan.sizeSol,
    quoteOutAmount: quote.outAmount,
    amountIn: amountLamports
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const { transaction, prioritizationFeeLamports } = await jupiter.buildSwapTx({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        computeUnitPriceMicroLamports: cuPriceToUse
      });

      transaction.sign([wallet.keypairInstance]);

      const tSend = Date.now();
      const { signature, slot } = await sender.sendAndConfirm({
        transaction,
        jitoTipLamports: plan.jitoTipLamports,
        computeUnitPriceMicroLamports: plan.computeUnitPriceMicroLamports,
        label: orderId
      });

      let quantityRaw = isBuy ? Number(quote.outAmount) : amountLamports;
      let amountInUsed = amountLamports;
      let amountOutUsed = isBuy ? quantityRaw : Number(quote.outAmount);
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
              execPrice = computeExecutionPrice({ isBuy, sizeSol: plan.sizeSol, quoteOutAmount: String(amountOutUsed), amountIn: amountInUsed });
            }
          } else {
            if (tokenDelta.delta !== 0) {
              amountInUsed = Math.abs(tokenDelta.delta);
              quantityRaw = amountInUsed;
            }
            const solDelta = diffSolBalance(txResult.meta);
            if (solDelta > 0) {
              amountOutUsed = solDelta;
              execPrice = computeExecutionPrice({ isBuy, sizeSol: plan.sizeSol, quoteOutAmount: String(amountOutUsed), amountIn: amountInUsed });
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
        amountOutUsed = isBuy ? quantityRaw : Number(quote.outAmount);
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
      const feeLamportsTotal = (prioritizationFeeLamports ?? 0) + (plan.jitoTipLamports ?? 0);
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
        feeLamportsTotal
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
        expectedSol: plan.expectedSol ?? null
      });
      try {
        landedRateGauge.set(1);
        slipAvgGauge.set(slipReal);
        timeToLandHistogram.set(ttl);
      } catch {}
      const feeBaseLamports = isBuy ? amountInUsed : amountOutUsed;
      const feeBps = feeBaseLamports > 0 ? (feeLamportsTotal / feeBaseLamports) * 10_000 : 0;
      try {
        updateArm(
          { congestionScore: 0.7, sizeSol: plan.sizeSol, equity: plan.sizeSol * 10, lpSol: candidate.lpSol, spreadBps: candidate.spreadBps },
          { cuPrice: cuPriceToUse, slippageBps: slippageToUse },
          { filled: true, realizedSlipBps: slipReal, feeBps }
        );
      } catch {}
      return;
    } catch (err) {
      lastError = err;
      logger.error({ err, attempt }, 'execution attempt failed');
      retriesTotal.inc();
      if (attempt < MAX_RETRIES - 1) {
        fallbacksTotal.inc();
      }
      const rs = routeStats.get(routeKey) ?? { attempts: 0, fails: 0, avgSlip: 0, penalty: 0 };
      rs.attempts += 1; rs.fails += 1; rs.penalty = Math.min(1, rs.fails / Math.max(1, rs.attempts)) * ((cfg as any).execution?.quarantine?.failRate ?? 0.4);
      routeStats.set(routeKey, rs);
      try { routePenaltyGauge.set({ route: routeKey }, rs.penalty); } catch {}
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
    expectedSol: plan.expectedSol ?? null
  });
  insertExecOutcome({ ts: Date.now(), quotePrice: 0, execPrice: null, filled: 0, route: plan.route, cuPrice: cuPriceToUse, slippageReq: slippageToUse, slippageReal: null, timeToLandMs: null, errorCode: (lastError as any)?.message ?? 'unknown', notes: 'failed' });
  throw lastError instanceof Error ? lastError : new Error('execution failed');
}

function createTradeIterator(bus: ExecutorEventBus): { iterator: AsyncGenerator<{ data: string }>; close: () => void } {
  const queue: Array<{ data: string }> = [];
  let notify: (() => void) | undefined;
  const unsubscribe = bus.onTrade((event) => {
    queue.push({ data: JSON.stringify(event) });
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

function computeExecutionPrice(params: { isBuy: boolean; sizeSol: number; quoteOutAmount: string; amountIn: number }): number {
  const { isBuy, sizeSol, quoteOutAmount, amountIn } = params;
  const outAmount = Number(quoteOutAmount);
  if (isBuy) {
    return outAmount > 0 ? sizeSol / (outAmount / 1_000_000_000) : 0;
  }
  return amountIn > 0 ? (outAmount / 1_000_000_000) / (amountIn / 1_000_000_000) : 0;
}

bootstrap().catch((err) => {
  logger.error({ err }, 'executor failed to start');
  process.exit(1);
});
