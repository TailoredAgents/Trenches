import 'dotenv/config';
import { Connection, PublicKey, LogsCallback } from '@solana/web3.js';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter, registerHistogram } from '@trenches/metrics';
import { createRpcConnection, TtlCache, sseQueue, sseRoute } from '@trenches/util';
import { insertMigrationEvent, createWriteQueue } from '@trenches/persistence';

type MigrationEvent = { ts: number; mint: string; pool: string; source: 'pumpfun' | 'pumpswap' | 'raydium'; initSig: string };

const logger = createLogger('migration-watcher');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';
const featureMigrationPoolFix = process.env.FEATURE_MIGRATION_POOL_FIX === '1';

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  let connection: Connection | null = null;
  if (!offline) {
    connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  } else {
    logger.warn('NO_RPC=1; skipping RPC connection and subscriptions');
  }

  // Metrics
  const eventsTotal = registerCounter({ name: 'migration_watcher_events_total', help: 'Total migration events emitted', labelNames: ['source'] });
  const dedupTotal = registerCounter({ name: 'migration_watcher_dedup_total', help: 'Total deduplicated events' });
  const emitLatency = registerHistogram({ name: 'migration_emit_latency_ms', help: 'RPC log to SSE emit latency', buckets: [10, 50, 100, 200, 400, 900, 2000] });

  // SSE queue (shared buffer drained by routes to preserve behavior)
  const queue: MigrationEvent[] = [];
  function emit(e: MigrationEvent) {
    queue.push(e);
  }

  app.get('/events/migrations', async (_request, reply) => {
    const stream = sseQueue<MigrationEvent>();
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      const e = queue.shift();
      if (e) stream.push(e);
    }, 50);
    sseRoute(reply, stream.iterator, () => {
      stopped = true;
      clearInterval(interval);
      stream.close();
    });
  });

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/healthz', async () => ({
    status: offline ? 'degraded' : 'ok',
    detail: offline ? 'rpc_missing' : 'ready',
    offline,
    providersOff,
    programs: config.addresses
  }));

  const address = await app.listen({ host: '0.0.0.0', port: config.services.migrationWatcher.port });
  logger.info({ address, programs: config.addresses }, 'migration-watcher listening');

  // Warn if programs look inactive (best-effort via getSignaturesForAddress)
  if (!offline && !providersOff && connection) {
    for (const [name, id] of Object.entries(config.addresses)) {
      if (!id) {
        logger.warn({ program: name }, 'program id not set');
        continue;
      }
      try {
        const sigs = await connection.getSignaturesForAddress(new PublicKey(id), { limit: 1 });
        if (!sigs || sigs.length === 0) {
          logger.warn({ program: name, id }, 'no recent signatures observed for program (may be fine)');
        }
      } catch (err) {
        logger.warn({ program: name, id, err }, 'failed to probe program activity');
      }
    }
  }

  const probePrograms = async () => {
    if (!connection || providersOff) {
      return;
    }
    const conn = connection;
    for (const [name, id] of Object.entries(config.addresses)) {
      if (!id) {
        logger.warn({ program: name }, 'program id not set');
        continue;
      }
      try {
        const sigs = await conn.getSignaturesForAddress(new PublicKey(id), { limit: 1 });
        if (!sigs || sigs.length === 0) {
          logger.warn({ program: name, id }, 'no recent signatures observed for program (may be fine)');
        }
      } catch (err) {
        logger.warn({ program: name, id, err }, 'failed to probe program activity');
      }
    }
  };

  const ttl = new TtlCache<string, boolean>(10 * 60 * 1000);
  const writer = createWriteQueue('migration');

  // Subscribe helpers
  function extractAccountKeysForTx(tx: any): string[] {
    const accounts: string[] = [];
    const message = tx?.transaction?.message as any;
    if (message && Array.isArray(message?.accountKeys)) {
      for (const key of message.accountKeys) accounts.push(key.toBase58());
      return accounts;
    }
    if (message && typeof message.getAccountKeys === 'function') {
      try {
        const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
        for (const k of keys.staticAccountKeys) accounts.push(k.toBase58());
        const lu = keys.accountKeysFromLookups;
        if (lu) { for (const k of lu.writable) accounts.push(k.toBase58()); for (const k of lu.readonly) accounts.push(k.toBase58()); }
      } catch (err) {
        logger.error({ err }, 'failed to extract account keys from message');
      }
    }
    return accounts;
  }

  function firstNonEmptyMint(postBals: any[]): string {
    for (const b of postBals) { if (b?.mint) { return b.mint as string; } }
    return '';
  }

  function isPlausibleBase58(address: string | undefined): boolean {
    if (!address || typeof address !== 'string') return false;
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  function normalizeMigrationEvent(tx: any, sig: string, source: MigrationEvent['source']): MigrationEvent | null {
    try {
      const accounts = extractAccountKeysForTx(tx);
      const postBals = Array.isArray(tx?.meta?.postTokenBalances) ? tx.meta.postTokenBalances : [];

      // Program-aware extraction (opt-in)
      if (featureMigrationPoolFix) {
        if (source === 'raydium') {
          // Reuse index-based approach similar to onchain-discovery RpcRaydiumWatcher
          const pool = accounts[0] ?? '';
          const poolCoinAccount = accounts[5];
          const poolPcAccount = accounts[6];
          if (!isPlausibleBase58(pool)) {
            // if missing key indexes, fall back to legacy handling below
          } else {
            const resolveMint = (account: string | undefined): string | undefined => {
              if (!account) return undefined;
              for (const bal of postBals) {
                const ai = (bal?.accountIndex ?? -1) as number;
                const acct = accounts[ai] ?? '';
                if (acct === account && bal?.mint) {
                  return String(bal.mint);
                }
              }
              return undefined;
            };
            const baseMint = resolveMint(poolCoinAccount);
            const quoteMint = resolveMint(poolPcAccount);
            const pickMint = baseMint || quoteMint || firstNonEmptyMint(postBals);
            const timestampMs = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
            if (isPlausibleBase58(pool)) {
              return { ts: timestampMs, mint: pickMint ?? '', pool, source, initSig: sig };
            }
          }
        } else {
          // Conservative heuristic for pumpfun/pumpswap
          const mintSet = new Set<string>();
          const ownerCounts = new Map<string, number>();
          for (const b of postBals) {
            const m = b?.mint as string | undefined;
            if (m) mintSet.add(m);
            const owner = (b && typeof b === 'object') ? (b.owner || (b.uiTokenAmount as any)?.owner) : '';
            if (isPlausibleBase58(owner)) {
              ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
            }
          }
          // Require two distinct mints
          if (mintSet.size >= 2) {
            // Find an owner that appears at least twice across token balances
            let poolCandidate = '';
            for (const [o, c] of ownerCounts.entries()) {
              if (c >= 2 && (!poolCandidate || c > (ownerCounts.get(poolCandidate) ?? 0))) {
                poolCandidate = o;
              }
            }
            if (isPlausibleBase58(poolCandidate)) {
              // Choose a mint that is not SOL wrapper if present
              const SOL_MINT = 'So11111111111111111111111111111111111111112';
              const nonSolMint = Array.from(mintSet).find((m) => m !== SOL_MINT) ?? Array.from(mintSet)[0] ?? '';
              const timestampMs = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
              return { ts: timestampMs, mint: nonSolMint, pool: poolCandidate, source, initSig: sig };
            }
          }
          // If we can't confidently infer, skip
          return null;
        }
      }

      // Legacy heuristic (flag off): first account as pool, first mint from post balances
      const pool = accounts[0] ?? '';
      const mint = firstNonEmptyMint(postBals);
      const timestampMs = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
      return { ts: timestampMs, mint, pool, source, initSig: sig };
    } catch (err) {
      logger.error({ err }, 'normalizeMigrationEvent failed');
      return null;
    }
  }

  const subscribeProgram = async (id: string, source: MigrationEvent['source']) => {
    if (!id) return;
    if (!connection) {
      logger.warn({ program: id, source }, 'skipping subscription; rpc offline');
      return;
    }
    const conn = connection;
    const pk = new PublicKey(id);
    const cb: LogsCallback = async (logInfo) => {
      const start = Date.now();
      try {
        const sig = logInfo.signature;
        if (ttl.get(sig)) {
          dedupTotal.inc();
          return;
        }
        const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
        if (!tx) return;
        const ev = normalizeMigrationEvent(tx, sig, source);
        if (!ev) return;
        ttl.set(sig, true);
        writer.push(() => insertMigrationEvent({ ts: ev.ts, mint: ev.mint, pool: ev.pool, source: ev.source, initSig: ev.initSig }));
        eventsTotal.inc({ source });
        emitLatency.observe(Date.now() - start);
        emit(ev);
      } catch (err) {
        logger.error({ err }, 'failed to handle onLogs');
      }
    };
    try {
      await conn.onLogs(pk, cb, 'confirmed');
      logger.info({ program: id, source }, 'subscribed to program logs');
    } catch (err) {
      logger.error({ program: id, err }, 'failed to subscribe to program logs');
    }
  };

  if (!offline && !providersOff && connection) {
    await subscribeProgram(config.addresses.raydiumAmmV4, 'raydium');
    await subscribeProgram(config.addresses.raydiumCpmm, 'raydium');
    await subscribeProgram(config.addresses.pumpswapProgram, 'pumpswap');
    await subscribeProgram(config.addresses.pumpfunProgram, 'pumpfun');
    await probePrograms();
  } else if (providersOff) {
    logger.warn('migration-watcher providers disabled; subscriptions skipped');
  } else {
    logger.warn('migration-watcher running in offline mode; subscriptions disabled');
  }
}

bootstrap().catch((err) => {
  logger.error({ err }, 'migration-watcher failed to start');
});
