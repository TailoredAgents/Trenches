import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import EventSource from 'eventsource';
import { createSSEClient, createInMemoryLastEventIdStore, TtlCache, createRpcConnection, resolveServiceUrl } from '@trenches/util';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { Connection } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerGauge } from '@trenches/metrics';
import { upsertPosition, listOpenPositions, getCandidateByMint, logTradeEvent, insertSizingOutcome } from '@trenches/persistence';
import { TokenCandidate, TradeEvent, OrderPlan } from '@trenches/shared';
import { BirdeyePriceOracle } from './birdeye';
import { getMintDecimals } from './mint';
import { PositionState } from './types';
import { positionsOpened, positionsClosed, exitsTriggered, trailingActivations, positionSizeGauge, maeAvgBpsGauge, maeMaxBpsGauge } from './metrics';
const logger = createLogger('position-manager');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';
const PRICE_REFRESH_MS = 7_000;
const POSITION_COUNT_GAUGE = registerGauge({
  name: 'position_manager_positions',
  help: 'Number of open positions'
});
const POSITION_REFRESH_EPOCH = registerGauge({
  name: 'position_manager_positions_last_refresh_epoch',
  help: 'Unix timestamp of last position count refresh'
});

async function bootstrap() {
  const config = loadConfig();
  const servicesRecord = config.services as Partial<Record<string, { port?: number }>>;
  const endpointsRecord = config.endpoints as Partial<Record<string, { baseUrl?: string }>> | undefined;
  const killSwitchToken = config.security.killSwitchToken;
  const app = Fastify({ logger: false });

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 180, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  let connection: Connection | null = null;
  if (!offline) {
    connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  } else {
    logger.warn('NO_RPC=1; position-manager running without RPC connection');
  }
  const oracle = new BirdeyePriceOracle();

  const positions = new Map<string, { state: PositionState; candidate?: TokenCandidate }>();
  if (!offline && connection) {
    await hydratePositions(connection, positions);
  } else {
    logger.warn('hydratePositions skipped in offline mode');
  }

  app.get('/healthz', async () => ({ status: offline ? 'degraded' : 'ok', offline, providersOff, rpc: config.rpc.primaryUrl, positions: positions.size }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  if (killSwitchToken) {
    app.post('/control/flatten', async (request, reply) => {
      const token = (request.headers.authorization ?? '').startsWith('Bearer ')
        ? (request.headers.authorization as string).slice('Bearer '.length)
        : undefined;
      if (token !== killSwitchToken) {
        reply.code(403).send({ status: 'forbidden' });
        return;
      }
      if (offline || !connection) {
        reply.code(503).send({ status: 'offline' });
        return;
      }
      let count = 0;
      for (const [mint, entry] of positions.entries()) {
        if (entry.state.quantity > 0) {
          try {
            await triggerExit({
              reason: 'manual_flatten',
              share: 1,
              mint,
              entry,
              price: entry.state.lastPrice ?? entry.state.avgPrice,
              config,
              connection
            });
            count += 1;
          } catch (err) {
            logger.error({ err, mint }, 'flatten trigger failed');
          }
        }
      }
      reply.code(202).send({ status: 'accepted', positions: count });
    });
  } else {
    logger.info('control/flatten endpoint disabled; kill switch token not configured');
  }

  const address = await app.listen({ port: config.services.positionManager.port, host: '0.0.0.0' });
  logger.info({ address }, 'position manager listening');



  const executorFeed = resolveServiceUrl(servicesRecord, endpointsRecord, 'executor', '/events/trades');
  let disposeStream: () => void = () => {};
  if (!offline && connection) {
    disposeStream = startTradeStream(executorFeed, async (event) => {
      if (event.t === 'fill') {
        await handleFillEvent(event, connection, positions, oracle);
      }
    });
  } else {
    logger.warn('trade stream disabled due to offline mode');
  }

  let priceTimer: NodeJS.Timeout | null = null;
  if (!offline && connection) {
    priceTimer = setInterval(async () => {
      await refreshPrices(connection, oracle, positions, config);
    }, PRICE_REFRESH_MS);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'position manager shutting down');
    if (priceTimer) {
      clearInterval(priceTimer);
    }
    try {
      disposeStream();
    } catch (err) {
      logger.error({ err }, 'failed to close trade stream');
    }
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    process.exit(0);
  }
}

type TradeHandler = (event: TradeEvent) => Promise<void> | void;

function startTradeStream(url: string, handler: TradeHandler): () => void {
  const store = createInMemoryLastEventIdStore();
  const client = createSSEClient(url, {
    lastEventIdStore: store,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
    onOpen: () => {
      logger.info({ url }, 'connected to executor trade stream');
    },
    onError: (err, attempt) => {
      logger.error({ err, attempt }, 'trade stream error');
    },
    onEvent: async (event) => {
      if (!event?.data || event.data === 'ping') {
        return;
      }
      try {
        const payload = JSON.parse(event.data) as TradeEvent;
        await handler(payload);
      } catch (err) {
        logger.error({ err }, 'failed to parse trade event');
      }
    }
  });
  return () => client.dispose();
}

async function hydratePositions(
  connection: Connection,
  positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>
): Promise<void> {
  const rows = listOpenPositions();
  for (const row of rows) {
    const candidate = getCandidateByMint(row.mint);
    const decimals = await getMintDecimals(connection, row.mint);
    positions.set(row.mint, {
      state: {
        mint: row.mint,
        quantity: row.quantity,
        quantityRaw: row.quantity * 10 ** decimals,
        avgPrice: row.averagePrice,
        realizedPnl: row.realizedPnl,
        unrealizedPnl: row.unrealizedPnl,
        ladderHits: new Set(row.ladderHits.map((value) => Number(value)).filter((value) => !Number.isNaN(value))),
        trailActive: row.trailActive,
        highestPrice: row.averagePrice,
        decimals,
        entryPrice: row.quantity > 0 ? row.averagePrice : undefined,
        lowWaterPrice: row.quantity > 0 ? row.averagePrice : undefined,
        maeBps: row.maeBps ?? 0
      },
      candidate
    });
  }
  await refreshExposureMetrics(positions);
}

function createEmptyState(mint: string, decimals: number): PositionState {
  return {
    mint,
    quantity: 0,
    quantityRaw: 0,
    avgPrice: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    ladderHits: new Set<number>(),
    trailActive: false,
    highestPrice: 0,
    decimals,
    entryPrice: undefined,
    lowWaterPrice: undefined,
    maeBps: 0
  };
}

async function handleFillEvent(
  event: Extract<TradeEvent, { t: 'fill' }>,
  connection: Connection,
  positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>,
  oracle: BirdeyePriceOracle
): Promise<void> {
  const mint = event.mint;
  const decimals = await getMintDecimals(connection, mint);
  const qtyTokens = event.qty / 10 ** decimals;
  const isBuy = (event.side ?? 'buy') === 'buy';

  const entry = positions.get(mint) ?? { state: createEmptyState(mint, decimals), candidate: getCandidateByMint(mint) };
  if (!positions.has(mint)) {
    positions.set(mint, entry);
  }
  const state = entry.state;
  const prevQty = state.quantity;

  if (isBuy) {
    const totalCost = state.avgPrice * state.quantity + event.px * qtyTokens;
    state.quantity += qtyTokens;
    state.quantityRaw += event.qty;
    state.avgPrice = state.quantity > 0 ? totalCost / state.quantity : 0;
    state.highestPrice = Math.max(state.highestPrice, event.px);
    if (state.quantity > 0) {
      state.entryPrice = state.avgPrice;
      if (prevQty <= 0) {
        state.lowWaterPrice = event.px;
        state.maeBps = 0;
      }
    }
    if (state.quantity === qtyTokens) {
      positionsOpened.inc();
    }
  } else {
    const sellQty = Math.min(state.quantity, qtyTokens);
    const pnl = (event.px - state.avgPrice) * sellQty;
    state.quantity = Math.max(state.quantity - sellQty, 0);
    state.quantityRaw = Math.max(state.quantityRaw - event.qty, 0);
    state.realizedPnl += pnl;
    if (state.quantity <= 0) {
      state.quantity = 0;
      state.quantityRaw = 0;
      state.ladderHits.clear();
      state.trailActive = false;
      state.highestPrice = state.avgPrice;
      positionsClosed.inc();
      const maeBps = Math.round(state.maeBps ?? 0);
      // Log sizing outcome on close (approximate notional and pnl in USD)
      try {
        const solUsd = await oracle.getPrice('So11111111111111111111111111111111111111112');
        const pnlUsd = (state.realizedPnl ?? 0) * (typeof solUsd === 'number' ? solUsd : 0);
        const notionalUsd = sellQty * state.avgPrice * (typeof solUsd === 'number' ? solUsd : 0);
        insertSizingOutcome({ ts: Date.now(), mint, notional: notionalUsd, pnlUsd, maeBps, closed: 1 });
      } catch (err) {
        logger.error({ err, mint }, 'failed to record sizing outcome');
      }
      state.entryPrice = undefined;
      state.lowWaterPrice = undefined;
      state.maeBps = 0;
    }
  }
  state.lastPrice = event.px;
  state.decimals = decimals;
  state.unrealizedPnl = state.lastPrice ? (state.lastPrice - state.avgPrice) * state.quantity : state.unrealizedPnl;
  updateMae(state, state.lastPrice);

  await persistPosition(state);
  await refreshExposureMetrics(positions);
  const prefix = `${mint}:`;
  for (const [key] of pendingCache.entries()) {
    if (key.startsWith(prefix)) {
      pendingCache.delete(key);
    }
  }
}

async function refreshPrices(
  connection: Connection,
  oracle: BirdeyePriceOracle,
  positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>,
  config: ReturnType<typeof loadConfig>
): Promise<void> {
  for (const [mint, entry] of positions.entries()) {
    const state = entry.state;
    if (state.quantity <= 0) {
      continue;
    }
    let price = state.lastPrice ?? undefined;
    if (!price) {
      price = await oracle.getPrice(mint);
    }
    if (!price) {
      continue;
    }
    state.lastPrice = price;
    state.unrealizedPnl = (price - state.avgPrice) * state.quantity;
    state.highestPrice = Math.max(state.highestPrice, price);
    updateMae(state, price);

    await evaluatePosition({ mint, entry, price, config, connection });
    await persistPosition(state);
  }
  await refreshExposureMetrics(positions);
}

async function evaluatePosition(params: {
  mint: string;
  entry: { state: PositionState; candidate?: TokenCandidate };
  price: number;
  config: ReturnType<typeof loadConfig>;
  connection: Connection;
}): Promise<void> {
  const { mint, entry, price, config, connection } = params;
  const state = entry.state;
  if (state.quantity <= 0) {
    return;
  }

  // Autokill: safety regression, LP unlock/pull, or flow collapse
  try {
    const cand = getCandidateByMint(mint) ?? entry.candidate;
    if (cand) {
      const ak = (config as any).positionManager?.autokill as
        | { flowRatioThreshold?: number; uniquesDropThreshold?: number; safetyReasons?: string[] }
        | undefined;
      const safetyReasons = ak?.safetyReasons ?? [];
      const reasons = cand.safety?.reasons ?? [];
      const safetyRegression = !cand.safety?.ok || reasons.some((r) => safetyReasons.includes(String(r)));

      const buys = cand.buys60 ?? 0;
      const sells = cand.sells60 ?? 0;
      const ratio = sells > 0 ? buys / sells : Infinity;
      const threshold = ak?.flowRatioThreshold ?? 0.6;
      // Maintain a simple uniques trend tracker in-module
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g: any = globalThis as any;
      g.__pm_last_uniques = g.__pm_last_uniques ?? new Map<string, number>();
      const lastUniques: Map<string, number> = g.__pm_last_uniques;
      const prevU = lastUniques.get(mint) ?? cand.uniques60 ?? 0;
      const currU = cand.uniques60 ?? 0;
      const uniquesDrop = ak?.uniquesDropThreshold ?? 1;
      const uniquesFalling = currU + uniquesDrop < prevU;
      lastUniques.set(mint, currU);

      const flowCollapse = ratio < threshold && uniquesFalling;
      if (safetyRegression || flowCollapse) {
        await triggerExit({
          reason: 'autokill',
          share: 1,
          mint,
          entry,
          price,
          config,
          connection
        });
        return;
      }
    }
  } catch (err) {
    logger.error({ err, mint }, 'autokill evaluation failed');
  }

  const ladders = config.ladders.multiplierPercents ?? [50, 100, 200, 400];
  const ladderShares = [0.25, 0.25, 0.25, 1];

  // Survival-Stops v1 (if enabled)
  try {
    if ((config as any).features?.survivalStops) {
      const cand = getCandidateByMint(mint) ?? entry.candidate;
      const pnlPct = (price - state.avgPrice) / Math.max(state.avgPrice, 1e-9);
      const spreadBps = cand?.spreadBps ?? 0;
      const volatilityBps = cand?.spreadBps ?? 0;
      const buys = cand?.buys60 ?? 0; const sells = cand?.sells60 ?? 1; const flowRatio = sells > 0 ? buys / sells : 1;
      const slipGapBps = 0;
      const rugProb = (cand as any)?.rugProb as number | undefined;
      const { computeStops } = await import('./survival_stops');
      const hs = computeStops({ mint, avgPrice: state.avgPrice, highestPrice: state.highestPrice, lastPrice: price }, {
        pnlPct,
        ageSec: 0,
        spreadBps,
        volatilityBps,
        flowRatio,
        slipGapBps,
        rugProb
      });
      // Panic flatten
      if (hs.hazard >= ((config as any).survival?.hazardPanic ?? 0.85)) {
        await triggerExit({ reason: 'autokill', share: 1, mint, entry, price, config, connection });
        return;
      }
      // Replace trail logic with hazard-trail
      const drop = 1 - price / Math.max(state.highestPrice, price);
      const trailPctDyn = Math.max(0.01, hs.sellTrailBps / 10000);
      if (!state.trailActive && pnlPct >= (config.ladders.trailActivatePct / 100)) {
        state.trailActive = true;
        trailingActivations.inc();
      }
      if (state.trailActive && drop >= trailPctDyn) {
        await triggerExit({ reason: 'trailing_stop', share: 1, mint, entry, price, config, connection });
        state.trailActive = false;
        return;
      }
      // Optional: compress ladder levels on tighten hazard
      const tight = hs.hazard >= ((config as any).survival?.hazardTighten ?? 0.65);
      if (tight) {
        const lvl = (config as any).survival?.ladderLevels ?? [0.05, 0.12, 0.22];
        // Map survival ladder fractions to price targets
        for (let i = 0; i < lvl.length; i++) {
          if (state.ladderHits.has(i)) continue;
          const targetPrice = state.avgPrice * (1 + lvl[i]);
          if (price >= targetPrice) {
            await triggerExit({ reason: `ladder_${Math.round(lvl[i]*10000)/100}`, share: i === lvl.length - 1 ? 1 : 0.25, mint, entry, price, config, connection });
            state.ladderHits.add(i);
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err, mint }, 'survival-stops eval failed');
  }
  for (let i = 0; i < ladders.length && i < ladderShares.length; i += 1) {
    if (state.ladderHits.has(i)) {
      continue;
    }
    const targetPrice = state.avgPrice * (1 + ladders[i] / 100);
    if (price >= targetPrice) {
      await triggerExit({
        reason: `ladder_${ladders[i]}`,
        share: i === ladders.length - 1 ? 1 : ladderShares[i],
        mint,
        entry,
        price,
        config,
        connection
      });
      state.ladderHits.add(i);
    }
  }

  const gainPct = (price - state.avgPrice) / Math.max(state.avgPrice, 1e-9);
  if (!state.trailActive && gainPct >= config.ladders.trailActivatePct / 100) {
    state.trailActive = true;
    trailingActivations.inc();
  }

  if (state.trailActive) {
    const drop = 1 - price / Math.max(state.highestPrice, price);
    if (drop >= config.ladders.trailPct / 100) {
      await triggerExit({
        reason: 'trailing_stop',
        share: 1,
        mint,
        entry,
        price,
        config,
        connection
      });
      state.trailActive = false;
      return;
    }
  }

  const hardStopLevel = state.avgPrice * (1 - config.ladders.hardStopLossPct / 100);
  if (price <= hardStopLevel) {
    await triggerExit({
      reason: 'hard_stop',
      share: 1,
      mint,
      entry,
      price,
      config,
      connection
    });
  }
}

const pendingCache = new TtlCache<string, boolean>(10_000);

async function triggerExit(params: {
  reason: string;
  share: number;
  mint: string;
  entry: { state: PositionState; candidate?: TokenCandidate };
  price: number;
  config: ReturnType<typeof loadConfig>;
  connection: Connection;
}): Promise<void> {
  const { reason, share, mint, entry, price, config, connection } = params;
  const key = `${mint}:${reason}`;
  if (pendingCache.get(key)) {
    return;
  }
  const state = entry.state;
  if (state.quantity <= 0) {
    return;
  }
  const decimals = await getMintDecimals(connection, mint);
  const quantityToSell = state.quantity * Math.min(Math.max(share, 0), 1);
  if (quantityToSell <= 0) {
    return;
  }
  const tokenAmountLamports = Math.max(Math.floor(quantityToSell * 10 ** decimals), 1);
  const expectedSol = quantityToSell * price;
  const expectedPnl = (price - state.avgPrice) * quantityToSell;

  const plan: OrderPlan = {
    mint,
    gate: 'strict',
    route: 'jupiter',
    sizeSol: expectedSol,
    slippageBps: Math.min(Math.max(config.gating.maxSpreadBps ?? 150, 50), 400),
    jitoTipLamports: pickExitTip(config),
    side: 'sell',
    tokenAmountLamports,
    expectedSol,
    clientOrderId: randomUUID()
  };

  pendingCache.set(key, true);
  exitsTriggered.inc({ reason });
  // Emit an exit event for observability (expected PnL at trigger time)
  const mappedReason = reason.startsWith('ladder_') ? 'tp' : reason === 'trailing_stop' ? 'trail' : reason === 'hard_stop' ? 'stop' : 'autokill';
  logTradeEvent({ t: 'exit', mint, reason: mappedReason as 'tp' | 'trail' | 'stop' | 'autokill', pnl: expectedPnl });
  try {
    await submitExitPlan(plan, entry.candidate);
  } catch (err) {
    logger.error({ err, mint, reason }, 'failed to submit exit plan');
  }
}

function pickExitTip(config: ReturnType<typeof loadConfig>): number {
  const lo = (config as any).positionManager?.tipRangeLamports?.min ?? 1_500_000;
  const hi = (config as any).positionManager?.tipRangeLamports?.max ?? 2_500_000;
  return Math.floor(lo + Math.random() * Math.max(1, hi - lo));
}

async function submitExitPlan(plan: OrderPlan, candidate?: TokenCandidate): Promise<void> {
  const config = loadConfig();
  const servicesRecord = config.services as Partial<Record<string, { port?: number }>>;
  const endpointsRecord = config.endpoints as Partial<Record<string, { baseUrl?: string }>> | undefined;
  const executorUrl = resolveServiceUrl(servicesRecord, endpointsRecord, 'executor', '/execute');
  const response = await fetch(executorUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, context: { candidate } })
  });
  if (!response.ok) {
    throw new Error(`executor responded ${response.status}`);
  }
}

function updateMae(state: PositionState, price?: number): void {
  if (state.quantity <= 0 || price === undefined || Number.isNaN(price)) {
    return;
  }
  if (state.entryPrice === undefined || state.entryPrice <= 0) {
    state.entryPrice = state.avgPrice > 0 ? state.avgPrice : price;
    state.lowWaterPrice = price;
    state.maeBps = 0;
    return;
  }
  const low = state.lowWaterPrice === undefined ? price : Math.min(state.lowWaterPrice, price);
  state.lowWaterPrice = low;
  if (state.entryPrice > 0 && low < state.entryPrice) {
    const drawdown = state.entryPrice - low;
    const mae = (drawdown / state.entryPrice) * 10_000;
    state.maeBps = Math.max(state.maeBps ?? 0, mae);
  }
}

async function persistPosition(state: PositionState): Promise<void> {
  await upsertPosition({
    mint: state.mint,
    quantity: state.quantity,
    averagePrice: state.avgPrice,
    realizedPnl: state.realizedPnl,
    unrealizedPnl: state.unrealizedPnl,
    state: state.quantity > 0 ? 'OPEN' : 'CLOSED',
    ladderHits: Array.from(state.ladderHits).map(String),
    trailActive: state.trailActive,
    maeBps: state.maeBps ?? 0
  });
}

async function refreshExposureMetrics(positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>): Promise<void> {
  let exposure = 0;
  let count = 0;
  let maeSum = 0;
  let maeMax = 0;
  for (const entry of positions.values()) {
    if (entry.state.quantity > 0) {
      exposure += entry.state.quantity * entry.state.avgPrice;
      count += 1;
      const m = Math.max(0, Math.round(entry.state.maeBps ?? 0));
      maeSum += m;
      if (m > maeMax) maeMax = m;
    }
  }
  positionSizeGauge.set(exposure);
  POSITION_COUNT_GAUGE.set(count);
  if (count > 0) {
    maeAvgBpsGauge.set(maeSum / count);
    maeMaxBpsGauge.set(maeMax);
  } else {
    maeAvgBpsGauge.set(0);
    maeMaxBpsGauge.set(0);
  }
  POSITION_REFRESH_EPOCH.set(Math.floor(Date.now() / 1000));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'position manager failed to start');
});
