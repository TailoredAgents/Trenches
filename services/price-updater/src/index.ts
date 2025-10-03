import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { PublicKey } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter, registerGauge } from '@trenches/metrics';
import { upsertPrice } from '@trenches/persistence';
import { createRpcConnection } from '@trenches/util';

const logger = createLogger('price-updater');

function readI32LE(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}
function readI64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}

// Minimal Pyth V2 price account decoder (classic layout)
// Assumes: exponent at offset 20 (i32), aggregate PriceInfo at offset 208
// PriceInfo: i64 price, u64 conf, u32 status, u32 corpAct, u64 pubSlot
function decodePythPriceV2(data: Buffer): { price: number; expo: number; pubSlot: bigint } | null {
  try {
    if (data.length < 240) return null;
    const expo = readI32LE(data, 20);
    const aggOffset = 208;
    const rawPrice = readI64LE(data, aggOffset);
    const pubSlot = data.readBigUInt64LE(aggOffset + 24);
    const scaled = Number(rawPrice) * Math.pow(10, expo);
    if (!Number.isFinite(scaled)) return null;
    return { price: scaled, expo, pubSlot };
  } catch (err) {
    logger.error({ err }, 'failed to decode pyth price');
    return null;
  }
}

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 120, timeWindow: '1 minute' });

  const runsTotal = registerCounter({ name: 'price_updater_runs_total', help: 'Price updater runs' });
  const lastSuccessTs = registerGauge({ name: 'price_updater_last_success_ts', help: 'Last successful SOL price ts (unix seconds)' });
  const staleSeconds = registerGauge({ name: 'price_updater_stale_seconds', help: 'Now - last success (seconds)' });

  const connection = createRpcConnection(config.rpc, { commitment: 'confirmed' });
  const account = String((config as any).priceUpdater?.pythSolUsdPriceAccount || '');
  const enabled = Boolean((config as any).priceUpdater?.enabled !== false);
  const intervalMs = Math.max(10_000, Number((config as any).priceUpdater?.intervalMs ?? 60_000));

  app.get('/healthz', async () => ({ status: enabled ? 'ok' : 'disabled', configured: Boolean(account), intervalMs }));
  app.get('/metrics', async (_req, reply) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  logger.info({ address }, 'price-updater listening');

  if (!enabled) {
    logger.warn('price-updater disabled via config');
    return;
  }
  if (!account) {
    logger.warn('price-updater: no pyth account configured, skipping updates');
    // still tick metrics to keep staleSeconds advancing from 0
    setInterval(() => {
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        // do not set lastSuccessTs; only update staleSeconds if previously set
        const lastVal = (lastSuccessTs as any)._last as number | undefined;
        if (typeof lastVal === 'number' && Number.isFinite(lastVal)) {
          staleSeconds.set(nowSec - lastVal);
        }
      } catch (err) {
        logger.error({ err }, 'failed to update stale seconds without account');
      }
    }, intervalMs).unref();
    return;
  }

  const pubkey = new PublicKey(account);
  setInterval(async () => {
    runsTotal.inc();
    try {
      const info = await connection.getAccountInfo(pubkey, { commitment: 'confirmed' });
      if (!info?.data) return;
      const buf = Buffer.from(info.data as Buffer);
      const decoded = decodePythPriceV2(buf);
      if (!decoded) return;
      if (Number.isFinite(decoded.price) && decoded.price > 0) {
        const tsMs = Date.now();
        upsertPrice(tsMs, 'SOL', decoded.price);
        const nowSec = Math.floor(tsMs / 1000);
        lastSuccessTs.set(nowSec);
        staleSeconds.set(0);
      }
    } catch (err) {
      logger.error({ err }, 'price-updater tick failed');
    }
    try {
      const last = (lastSuccessTs as any)._last as number | undefined;
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof last === 'number' && Number.isFinite(last)) {
        staleSeconds.set(nowSec - last);
      }
    } catch (err) {
      logger.error({ err }, 'failed to update stale seconds gauge');
    }
  }, intervalMs).unref();
}

bootstrap().catch((err) => {
  logger.error({ err }, 'price-updater failed to start');
  process.exit(1);
});
