import 'dotenv/config';
import Fastify, { type FastifyReply } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Server as HttpServer, ServerResponse } from 'http';
import { Connection, PublicKey, LogsCallback } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { startMetricsServer, registerCounter, registerGauge } from '@trenches/metrics';
import { createLogger } from '@trenches/logger';
import { createRpcConnection } from '@trenches/util';
import {
  insertLeaderHit,
  upsertLeaderScore,
  getRecentLeaderHits,
  getTopLeaderWallets,
  listRecentMigrationEvents,
  getDb,
  createWriteQueue
} from '@trenches/persistence';

const MIGRATION_POLL_INTERVAL_MS = 15_000;
const EXPIRY_SWEEP_INTERVAL_MS = 30_000;
const SCORE_INTERVAL_MS = 60_000;
const SIGNATURE_CACHE_SIZE = 2048;
const FORWARD_RETURN_MIN_OFFSET_MS = 15 * 60 * 1000;
const FORWARD_RETURN_MAX_OFFSET_MS = 60 * 60 * 1000;

let metricsServer: HttpServer | null = null;
const logger = createLogger('leader-wallets');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';
const leaderHitsTotal = registerCounter({ name: 'leader_hits_total', help: 'Total leader wallet swap hits captured' });
const leaderTopGauge = registerGauge({ name: 'leader_wallets_top', help: 'Top leader wallet scores', labelNames: ['rank'] });

interface LeaderPoolSubscription {
  subId: number;
  expiresAt: number;
}

interface LeaderHitEvent {
  pool: string;
  wallet: string;
  ts: number;
  signature: string;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 0) {
    return (ordered[mid - 1] + ordered[mid]) / 2;
  }
  return ordered[mid];
}

function startSseStream(reply: FastifyReply, clients: Set<ServerResponse>): void {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('\n');
  const onClose = () => {
    clients.delete(res);
  };
  res.on('close', onClose);
  clients.add(res);
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const metricsPort = cfg.services.leaderWallets.metricsPort ?? cfg.services.metrics.port;
  metricsServer = startMetricsServer({ port: metricsPort });
  const leaderCfg = cfg.leaderWallets ?? {
    enabled: true,
    watchMinutes: 5,
    minHitsForBoost: 1,
    scoreHalfLifeDays: 14,
    rankBoost: 0.03,
    sizeTierBoost: 1
  };
  const watchWindowMs = Math.max(1, leaderCfg.watchMinutes) * 60_000;

  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 300, timeWindow: '1 minute' });

  const sseClients = new Set<ServerResponse>();
  const activePools = new Map<string, LeaderPoolSubscription>();
  const signatureQueue: string[] = [];
  const signatureSet = new Set<string>();
  const writeQueue = createWriteQueue('leader-wallets');

  let connection: Connection | null = null;
  let scoreDirty = true;
  let lastScoreUpdate = 0;
  let lastHitTs = 0;
  let lastMigrationTs = 0;
  let shuttingDown = false;
  let migrationTimer: NodeJS.Timeout | null = null;
  let expiryTimer: NodeJS.Timeout | null = null;
  let scoreTimer: NodeJS.Timeout | null = null;

  function rememberSignature(signature: string): boolean {
    if (signatureSet.has(signature)) {
      return false;
    }
    signatureSet.add(signature);
    signatureQueue.push(signature);
    if (signatureQueue.length > SIGNATURE_CACHE_SIZE) {
      const oldest = signatureQueue.shift();
      if (oldest) {
        signatureSet.delete(oldest);
      }
    }
    return true;
  }

  function broadcastHit(event: LeaderHitEvent): void {
    const payload = `event: leader-hit\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of [...sseClients]) {
      try {
        client.write(payload);
      } catch (err) {
        sseClients.delete(client);
        try {
          client.end();
        } catch (closeErr) {
          logger.error({ err: closeErr }, 'failed to close SSE client after write failure');
        }
      }
    }
  }

  async function recomputeLeaderScoresInternal(): Promise<void> {
    const db = getDb();
    const walletRows = db.prepare('SELECT DISTINCT wallet FROM leader_hits').all() as Array<{ wallet: string }>;
    if (walletRows.length === 0) {
      leaderTopGauge.reset();
      lastScoreUpdate = Date.now();
      return;
    }

    const now = Date.now();
    const halfLifeDays = Math.max(leaderCfg.scoreHalfLifeDays, 0.1);
    const hitsStmt = db.prepare('SELECT pool, ts FROM leader_hits WHERE wallet = ? ORDER BY ts DESC LIMIT 200');
    const forwardStmt = db.prepare(
      `SELECT amount_in AS amountIn, amount_out AS amountOut, exec_price AS execPrice, quote_price AS quotePrice
         FROM exec_outcomes
         WHERE mint = @mint AND filled = 1 AND side = 'buy' AND ts BETWEEN @start AND @end
         LIMIT 50`
    );
    const resolveMintStmt = db.prepare('SELECT mint FROM migration_events WHERE pool = ? ORDER BY ts DESC LIMIT 1');
    const poolMintCache = new Map<string, string | null>();
    const resolveMintForPool = (pool: string): string | null => {
      if (!pool) return null;
      if (poolMintCache.has(pool)) {
        return poolMintCache.get(pool) ?? null;
      }
      const result = resolveMintStmt.get(pool) as { mint?: string } | undefined;
      const mint = result?.mint ?? null;
      poolMintCache.set(pool, mint);
      return mint;
    };

    for (const { wallet } of walletRows) {
      const hitRows = hitsStmt.all(wallet) as Array<{ pool: string; ts: number }>;
      if (hitRows.length === 0) {
        continue;
      }
      const returns: number[] = [];
      let mostRecent = 0;
      for (const hit of hitRows) {
        if (!hit.pool) continue;
        mostRecent = Math.max(mostRecent, hit.ts);
        const mint = resolveMintForPool(hit.pool);
        if (!mint) {
          continue;
        }
        const forwardRows = forwardStmt.all({
          mint,
          start: hit.ts + FORWARD_RETURN_MIN_OFFSET_MS,
          end: hit.ts + FORWARD_RETURN_MAX_OFFSET_MS
        }) as Array<{ amountIn: number | null; amountOut: number | null; execPrice: number | null; quotePrice: number | null }>;
        if (forwardRows.length === 0) {
          continue;
        }
        const forwardReturns: number[] = [];
        for (const row of forwardRows) {
          if (row.amountIn && row.amountOut && row.amountIn > 0) {
            forwardReturns.push(row.amountOut / row.amountIn - 1);
          } else if (row.quotePrice && row.execPrice && row.quotePrice !== 0) {
            forwardReturns.push((row.execPrice - row.quotePrice) / row.quotePrice);
          }
        }
        if (forwardReturns.length > 0) {
          returns.push(median(forwardReturns));
        }
      }
      const baseReturn = returns.length > 0 ? median(returns) : 0;
      const ageDays = mostRecent > 0 ? (now - mostRecent) / (24 * 60 * 60 * 1000) : 0;
      const decay = Math.pow(0.5, ageDays / halfLifeDays);
      const score = baseReturn * decay;
      const lastSeen = mostRecent || now;
      upsertLeaderScore({ wallet, score, lastSeenTs: lastSeen });
    }

    const top = getTopLeaderWallets(5);
    leaderTopGauge.reset();
    top.forEach((row, idx) => {
      leaderTopGauge.set({ rank: String(idx + 1) }, row.score ?? 0);
    });
    lastScoreUpdate = Date.now();
  }

  async function handleShutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    if (migrationTimer) {
      clearInterval(migrationTimer);
      migrationTimer = null;
    }
    if (expiryTimer) {
      clearInterval(expiryTimer);
      expiryTimer = null;
    }
    if (scoreTimer) {
      clearInterval(scoreTimer);
      scoreTimer = null;
    }
    for (const res of sseClients) {
      try {
        res.end();
      } catch (err) {
        logger.error({ err }, 'failed to end SSE client during shutdown');
      }
    }
    sseClients.clear();
    if (connection) {
      for (const { subId } of Array.from(activePools.values())) {
        try {
          await connection.removeOnLogsListener(subId);
        } catch (err) {
          logger.error({ err, subId }, 'failed to remove logs listener during shutdown');
        }
      }
    }
    activePools.clear();
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close leader-wallets fastify app');
    }
    if (metricsServer) {
      await new Promise<void>((resolve) => {
        metricsServer?.close(() => resolve());
      });
      metricsServer = null;
    }
    if (reason) {
      logger.info({ reason }, 'leader-wallets shutting down');
    }
  }

  const logHandlerForPool = (pool: string): LogsCallback => async (logInfo) => {
    if (!connection || !pool) return;
    const signature = logInfo.signature ?? '';
    if (!signature || !rememberSignature(signature)) {
      return;
    }
    try {
      const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      if (!tx) return;
      const anyTx = tx.transaction as any;
      let wallet = '';
      if (typeof anyTx?.message?.getAccountKeys === 'function') {
        const keys = anyTx.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
        wallet = keys?.staticAccountKeys?.[0]?.toBase58?.() ?? '';
      }
      if (!wallet) {
        const legacyKeys = anyTx?.message?.accountKeys ?? anyTx?.accountKeys;
        if (Array.isArray(legacyKeys) && legacyKeys.length) {
          wallet = legacyKeys[0]?.toBase58?.() ?? '';
        }
      }
      if (!wallet) return;
      const ts = Date.now();
      writeQueue.push(async () => {
        const inserted = insertLeaderHit({ pool, wallet, ts });
        if (inserted) {
          leaderHitsTotal.inc();
          lastHitTs = ts;
          scoreDirty = true;
          broadcastHit({ pool, wallet, ts, signature });
        }
      });
    } catch (err) {
      logger.error({ err }, 'leader-wallets log handler error');
    }
  };

  async function ensurePoolSubscription(pool: string, eventTs: number): Promise<void> {
    if (!leaderCfg.enabled || !connection) return;
    if (!pool) return;
    const watchUntil = eventTs + watchWindowMs;
    const existing = activePools.get(pool);
    if (existing) {
      existing.expiresAt = Math.max(existing.expiresAt, watchUntil);
      return;
    }
    try {
      const pk = new PublicKey(pool);
      const subId = await connection.onLogs(pk, logHandlerForPool(pool), 'confirmed');
      activePools.set(pool, { subId, expiresAt: watchUntil });
    } catch (err) {
      logger.error({ err, pool }, 'leader-wallets failed to subscribe pool');
    }
  }

  async function pollMigrations(): Promise<void> {
    if (!leaderCfg.enabled || !connection) return;
    try {
      const events = listRecentMigrationEvents(200);
      if (events.length === 0) {
        return;
      }
      if (lastMigrationTs === 0) {
        const baseline = Date.now() - watchWindowMs;
        const initial = events.filter((evt) => evt.ts >= baseline);
        initial.sort((a, b) => a.ts - b.ts);
        for (const evt of initial) {
          await ensurePoolSubscription(evt.pool, evt.ts);
        }
        lastMigrationTs = Math.max(...events.map((evt) => evt.ts));
        return;
      }
      const fresh = events.filter((evt) => evt.ts > lastMigrationTs);
      if (fresh.length === 0) {
        return;
      }
      fresh.sort((a, b) => a.ts - b.ts);
      for (const evt of fresh) {
        await ensurePoolSubscription(evt.pool, evt.ts);
      }
      lastMigrationTs = Math.max(lastMigrationTs, fresh[fresh.length - 1].ts);
    } catch (err) {
      logger.error({ err }, 'leader-wallets migration poll failed');
    }
  }

  async function sweepExpired(): Promise<void> {
    if (!connection) return;
    const now = Date.now();
    for (const [pool, info] of [...activePools.entries()]) {
      if (info.expiresAt <= now) {
        try {
          await connection.removeOnLogsListener(info.subId);
        } catch (err) {
          logger.error({ err, pool, subId: info.subId }, 'failed to remove expired pool listener');
        }
        activePools.delete(pool);
      }
    }
  }

  async function refreshScoresIfDirty(): Promise<void> {
    if (!leaderCfg.enabled) return;
    if (!scoreDirty) return;
    scoreDirty = false;
    writeQueue.push(async () => {
      try {
        await recomputeLeaderScoresInternal();
      } catch (err) {
        scoreDirty = true;
        logger.error({ err }, 'leader-wallets score recompute failed');
      }
    });
  }

  app.get('/healthz', async () => ({
    status: leaderCfg.enabled ? (offline ? 'degraded' : 'ok') : 'disabled',
    detail: offline ? 'offline' : leaderCfg.enabled ? 'running' : 'config_disabled',
    offline,
    providersOff,
    enabled: leaderCfg.enabled,
    poolsWatching: activePools.size,
    queueDepth: writeQueue.size(),
    lastHitTs,
    lastScoreUpdate
  }));

  app.get('/api/leader-hits', async () => {
    const db = getDb();
    const since = Date.now() - Math.max(watchWindowMs, 60 * 60 * 1000);
    const rows = db
      .prepare(`SELECT pool, COUNT(*) AS hits, MAX(ts) AS lastSeenTs FROM leader_hits WHERE ts >= @since GROUP BY pool ORDER BY lastSeenTs DESC LIMIT 20`)
      .all({ since }) as Array<{ pool: string; hits: number; lastSeenTs: number }>;
    return {
      status: 'ok',
      data: rows.map((row) => ({ pool: row.pool, hits: Number(row.hits ?? 0), lastSeenTs: row.lastSeenTs }))
    };
  });

  app.get('/api/leader-wallets/top', async () => ({ status: 'ok', data: getTopLeaderWallets(10) }));

  app.get('/api/leader-hits/:pool', async (request) => {
    const pool = String((request.params as { pool: string }).pool || '');
    if (!pool) {
      return { status: 'ok', data: [] };
    }
    const since = Date.now() - watchWindowMs;
    const hits = getRecentLeaderHits(pool, since);
    return { status: 'ok', data: hits };
  });

  app.get('/events', async (_request, reply) => {
    startSseStream(reply, sseClients);
  });

  const port = cfg.services?.leaderWallets?.port ?? 4019;
  await app.listen({ host: '0.0.0.0', port });
  logger.info({ port }, 'leader-wallets listening');

  if (leaderCfg.enabled && !offline) {
    connection = createRpcConnection(cfg.rpc, { commitment: 'confirmed' });
    await pollMigrations();
    migrationTimer = setInterval(pollMigrations, MIGRATION_POLL_INTERVAL_MS);
    expiryTimer = setInterval(() => void sweepExpired(), EXPIRY_SWEEP_INTERVAL_MS);
    scoreTimer = setInterval(() => void refreshScoresIfDirty(), SCORE_INTERVAL_MS);
    refreshScoresIfDirty();
  } else {
    logger.warn('leader-wallets watchers disabled due to offline mode or configuration');
  }

  const handleExit = async (reason: string) => {
    await handleShutdown(reason);
    process.exit(0);
  };

  process.on('SIGTERM', () => void handleExit('SIGTERM'));
  process.on('SIGINT', () => void handleExit('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'leader-wallets failed to start');
});
