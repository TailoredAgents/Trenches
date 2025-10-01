import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Connection, PublicKey, LogsCallback } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createRpcConnection } from '@trenches/util';
import { getDb } from '@trenches/persistence';

async function bootstrap() {
  const cfg = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 120, timeWindow: '1 minute' });
  app.get('/healthz', async () => ({ status: 'ok' }));
  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  console.log('leader-wallets listening at', address);

  const conn = createRpcConnection(cfg.rpc, { commitment: 'confirmed' });
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS leader_wallets (wallet TEXT PRIMARY KEY, score REAL NOT NULL, lastSeenTs INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS leader_hits (pool TEXT NOT NULL, wallet TEXT NOT NULL, ts INTEGER NOT NULL);
           CREATE INDEX IF NOT EXISTS idx_leader_hits_pool_ts ON leader_hits(pool, ts);`);

  async function subscribePool(pool: string) {
    try {
      const pk = new PublicKey(pool);
      const cb: LogsCallback = async (logInfo) => {
        try {
          const sig = logInfo.signature;
          const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
          if (!tx) return;
          const acct = tx.transaction.message.getAccountKeys?.({ accountKeysFromLookups: tx.meta?.loadedAddresses });
          const wallet = acct?.staticAccountKeys?.[0]?.toBase58?.() ?? '';
          if (!wallet) return;
          db.prepare('INSERT INTO leader_hits (pool, wallet, ts) VALUES (?, ?, ?)').run(pool, wallet, Date.now());
          const row = db.prepare('SELECT score FROM leader_wallets WHERE wallet = ?').get(wallet) as { score?: number } | undefined;
          const score = typeof row?.score === 'number' ? row!.score : 0.5;
          db.prepare('INSERT OR REPLACE INTO leader_wallets (wallet, score, lastSeenTs) VALUES (?, ?, ?)').run(wallet, score, Date.now());
        } catch {}
      };
      await conn.onLogs(pk, cb, 'confirmed');
    } catch {}
  }
  // Future: subscribe recent pools; placeholder no-op
}

bootstrap().catch((err) => { console.error('leader-wallets failed to start', err); process.exit(1); });

