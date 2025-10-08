import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { Connection } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { createRpcConnection } from '@trenches/util';
import { Gauge, Histogram, Registry } from 'prom-client';

const registry = new Registry();
const slotLag = new Gauge({ name: 'rpc_slot_lag', help: 'Slot lag between processed and finalized slots', registers: [registry] });
const txErr = new Gauge({ name: 'rpc_tx_error_rate', help: 'Recent RPC request error rate', registers: [registry] });
const latency = new Histogram({
  name: 'rpc_latency_ms',
  help: 'RPC request latency (ms)',
  buckets: [50, 100, 200, 400, 800, 1500],
  registers: [registry]
});

const SAMPLE_INTERVAL_MS = Number(process.env.RPC_MONITOR_INTERVAL_MS ?? '5000');
const ERROR_WINDOW = Math.max(1, Number(process.env.RPC_MONITOR_WINDOW ?? '12'));

const logger = createLogger('rpc-monitor');

function recordErrorSample(window: number[], success: boolean): number[] {
  const next = [...window, success ? 0 : 1];
  if (next.length > ERROR_WINDOW) {
    next.shift();
  }
  const failures = next.reduce((acc, val) => acc + val, 0);
  txErr.set(failures / next.length);
  return next;
}

async function sampleRpc(connection: Connection, window: number[]): Promise<number[]> {
  const start = Date.now();
  try {
    const processed = await connection.getSlot('processed');
    const finalized = await connection.getSlot('finalized');
    slotLag.set(Math.max(0, processed - finalized));
    latency.observe(Date.now() - start);
    return recordErrorSample(window, true);
  } catch (err) {
    latency.observe(Date.now() - start);
    logger.warn({ err }, 'rpc sample failed');
    return recordErrorSample(window, false);
  }
}

async function bootstrap() {
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  const cfg = loadConfig();
  const offline = process.env.NO_RPC === '1';
  let connection: Connection | null = null;
  let sampleWindow: number[] = [];
  let sampleTimer: NodeJS.Timeout | null = null;

  if (!offline) {
    connection = createRpcConnection(cfg.rpc, { commitment: 'processed' });
    const runSample = async () => {
      if (!connection) {
        return;
      }
      sampleWindow = await sampleRpc(connection, sampleWindow);
    };
    await runSample();
    sampleTimer = setInterval(() => {
      void runSample();
    }, SAMPLE_INTERVAL_MS);
  } else {
    logger.warn('NO_RPC=1; rpc-monitor running without active sampling');
  }

  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  logger.info({ address }, 'rpc-monitor listening');

  const shutdown = async (reason: string) => {
    logger.warn({ reason }, 'rpc-monitor shutting down');
    if (sampleTimer) {
      clearInterval(sampleTimer);
      sampleTimer = null;
    }
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close rpc-monitor server');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'rpc-monitor failed to start');
  process.exit(1);
});

