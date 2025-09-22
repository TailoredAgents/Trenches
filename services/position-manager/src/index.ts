try { require('dotenv').config(); } catch {}
import EventSource from 'eventsource';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import fetch from 'node-fetch';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerGauge } from '@trenches/metrics';
import { upsertPosition, listOpenPositions, getCandidateByMint, logTradeEvent } from '@trenches/persistence';
import { TokenCandidate, TradeEvent, OrderPlan } from '@trenches/shared';
import { BirdeyePriceOracle } from './birdeye';
import { getMintDecimals } from './mint';
import { PositionState } from './types';
import { positionsOpened, positionsClosed, exitsTriggered, trailingActivations, positionSizeGauge } from './metrics';
import { TtlCache } from '@trenches/util';

const logger = createLogger('position-manager');
const PRICE_REFRESH_MS = 7_000;
const POSITION_GAUGE_REFRESH = registerGauge({
  name: 'position_manager_positions',
  help: 'Number of open positions'
});

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 180, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  const rpcUrl = config.rpc.primaryUrl && config.rpc.primaryUrl.length > 0 ? config.rpc.primaryUrl : clusterApiUrl('mainnet-beta');
  const connection = new Connection(rpcUrl, 'confirmed');
  const oracle = new BirdeyePriceOracle();

  const positions = new Map<string, { state: PositionState; candidate?: TokenCandidate }>();
  await hydratePositions(connection, positions);

  app.get('/healthz', async () => ({ status: 'ok', rpc: rpcUrl, positions: positions.size }));

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  const address = await app.listen({ port: config.services.positionManager.port, host: '0.0.0.0' });
  logger.info({ address }, 'position manager listening');

  app.post('/control/flatten', async (request, reply) => {
    const token = (request.headers.authorization ?? '').startsWith('Bearer ')
      ? (request.headers.authorization as string).slice('Bearer '.length)
      : undefined;
    if (!config.security.killSwitchToken) {
      reply.code(501).send({ status: 'disabled' });
      return;
    }
    if (token !== config.security.killSwitchToken) {
      reply.code(403).send({ status: 'forbidden' });
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

  const executorFeed = `http://127.0.0.1:${config.services.executor.port}/events/trades`;
  const disposeStream = startTradeStream(executorFeed, async (event) => {
    if (event.t === 'fill') {
      await handleFillEvent(event, connection, positions);
    }
  });

  const priceTimer = setInterval(async () => {
    await refreshPrices(connection, oracle, positions, config);
  }, PRICE_REFRESH_MS);

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'position manager shutting down');
    clearInterval(priceTimer);
    disposeStream();
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
  const source = new EventSource(url);
  logger.info({ url }, 'connected to executor trade stream');
  source.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data) as TradeEvent;
      await handler(payload);
    } catch (err) {
      logger.error({ err }, 'failed to parse trade event');
    }
  };
  source.onerror = (err) => {
    logger.error({ err }, 'trade stream error');
  };
  return () => source.close();
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
        decimals
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
    decimals
  };
}

async function handleFillEvent(
  event: Extract<TradeEvent, { t: 'fill' }>,
  connection: Connection,
  positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>
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

  if (isBuy) {
    const totalCost = state.avgPrice * state.quantity + event.px * qtyTokens;
    state.quantity += qtyTokens;
    state.quantityRaw += event.qty;
    state.avgPrice = state.quantity > 0 ? totalCost / state.quantity : 0;
    state.highestPrice = Math.max(state.highestPrice, event.px);
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
    }
  }
  state.lastPrice = event.px;
  state.decimals = decimals;
  state.unrealizedPnl = state.lastPrice ? (state.lastPrice - state.avgPrice) * state.quantity : state.unrealizedPnl;

  await persistPosition(state);
  await refreshExposureMetrics(positions);
  pendingCache.clear();
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
    expectedSol
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
  const executorUrl = `http://127.0.0.1:${config.services.executor.port}/execute`;
  const response = await fetch(executorUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, context: { candidate } })
  });
  if (!response.ok) {
    throw new Error(`executor responded ${response.status}`);
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
    trailActive: state.trailActive
  });
}

async function refreshExposureMetrics(positions: Map<string, { state: PositionState; candidate?: TokenCandidate }>): Promise<void> {
  let exposure = 0;
  let count = 0;
  for (const entry of positions.values()) {
    if (entry.state.quantity > 0) {
      exposure += entry.state.quantity * entry.state.avgPrice;
      count += 1;
    }
  }
  positionSizeGauge.set(exposure);
  POSITION_GAUGE_REFRESH.set(Date.now());
}

bootstrap().catch((err) => {
  logger.error({ err }, 'position manager failed to start');
  process.exit(1);
});

