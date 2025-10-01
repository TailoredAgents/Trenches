import 'dotenv/config';
import { PublicKey, LogsCallback } from '@solana/web3.js';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter, registerHistogram } from '@trenches/metrics';
import { createRpcConnection, TtlCache } from '@trenches/util';
import { insertMigrationEvent, createWriteQueue } from '@trenches/persistence';

type MigrationEvent = { ts: number; mint: string; pool: string; source: 'pumpfun' | 'pumpswap' | 'raydium'; initSig: string };

const logger = createLogger('migration-watcher');

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  const connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });

  // Metrics
  const eventsTotal = registerCounter({ name: 'migration_watcher_events_total', help: 'Total migration events emitted', labelNames: ['source'] });
  const dedupTotal = registerCounter({ name: 'migration_watcher_dedup_total', help: 'Total deduplicated events' });
  const emitLatency = registerHistogram({ name: 'migration_emit_latency_ms', help: 'RPC log to SSE emit latency', buckets: [10, 50, 100, 200, 400, 900, 2000] });

  // SSE subscribers
  const subscribers = new Set<(e: MigrationEvent) => void>();
  const queue: MigrationEvent[] = [];
  function emit(e: MigrationEvent) {
    queue.push(e);
    for (const sub of subscribers) {
      try { sub(e); } catch {}
    }
  }

  app.get('/events/migrations', async (request, reply) => {
    const iterator = (async function* () {
      const on = (e: MigrationEvent) => {
        // push immediately
      };
      const sendQueue = async function* () {
        while (true) {
          const e = queue.shift();
          if (e) {
            yield { data: JSON.stringify(e) };
          } else {
            await new Promise((r) => setTimeout(r, 50));
          }
        }
      };
      for await (const chunk of sendQueue()) {
        yield chunk as any;
      }
      return undefined as never;
    })();
    reply.sse(iterator);
  });

  app.get('/metrics', async (_, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/healthz', async () => ({ status: 'ok', programs: config.addresses }));

  const address = await app.listen({ host: '0.0.0.0', port: config.services.migrationWatcher.port });
  logger.info({ address, programs: config.addresses }, 'migration-watcher listening');

  // Warn if programs look inactive (best-effort via getSignaturesForAddress)
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

  const ttl = new TtlCache<string, boolean>(10 * 60 * 1000);
  const writer = createWriteQueue('migration');

  // Subscribe helpers
  function normalizeMigrationEvent(tx: any, sig: string, source: MigrationEvent['source']): MigrationEvent | null {
    try {
      const accounts: string[] = [];
      const message = tx.transaction?.message as any;
      if (message && Array.isArray(message.accountKeys)) {
        for (const key of message.accountKeys) accounts.push(key.toBase58());
      } else if (message && typeof message.getAccountKeys === 'function') {
        try {
          const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
          for (const k of keys.staticAccountKeys) accounts.push(k.toBase58());
          const lu = keys.accountKeysFromLookups;
          if (lu) { for (const k of lu.writable) accounts.push(k.toBase58()); for (const k of lu.readonly) accounts.push(k.toBase58()); }
        } catch {}
      }
      // Pool heuristic: first writable account beyond program index
      const pool = accounts[0] ?? '';
      // Token mint heuristic: prefer postTokenBalances with owner == poolCoin/pc or non-empty mint
      const postBals = tx.meta?.postTokenBalances ?? [];
      let mint = '';
      for (const b of postBals) { if (b?.mint) { mint = b.mint; break; } }
      const timestampMs = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
      return { ts: timestampMs, mint, pool, source, initSig: sig };
    } catch (err) {
      logger.error({ err }, 'normalizeMigrationEvent failed');
      return null;
    }
  }

  const subscribeProgram = async (id: string, source: MigrationEvent['source']) => {
    if (!id) return;
    const pk = new PublicKey(id);
    const cb: LogsCallback = async (logInfo) => {
      const start = Date.now();
      try {
        const sig = logInfo.signature;
        if (ttl.get(sig)) {
          dedupTotal.inc();
          return;
        }
        const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
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
      await connection.onLogs(pk, cb, 'confirmed');
      logger.info({ program: id, source }, 'subscribed to program logs');
    } catch (err) {
      logger.error({ program: id, err }, 'failed to subscribe to program logs');
    }
  };

  await subscribeProgram(config.addresses.raydiumAmmV4, 'raydium');
  await subscribeProgram(config.addresses.raydiumCpmm, 'raydium');
  await subscribeProgram(config.addresses.pumpswapProgram, 'pumpswap');
  await subscribeProgram(config.addresses.pumpfunProgram, 'pumpfun');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'migration-watcher failed to start');
  process.exit(1);
});
