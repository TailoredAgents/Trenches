import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createLogger } from '@trenches/logger';
import { Gauge, Histogram, Registry } from 'prom-client';

const registry = new Registry();
const slotLag = new Gauge({ name: 'rpc_slot_lag', help: 'Slot lag vs. observed last slot', registers: [registry] });
const txErr = new Gauge({ name: 'rpc_tx_error_rate', help: 'Recent tx error rate', registers: [registry] });
const latency = new Histogram({ name: 'rpc_latency_ms', help: 'RPC latency ms', buckets: [50, 100, 200, 400, 800, 1500], registers: [registry] });

const logger = createLogger('rpc-monitor');

async function bootstrap() {
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });

  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  logger.info({ address }, 'rpc-monitor listening');
}

bootstrap().catch((err) => {
  logger.error({ err }, 'rpc-monitor failed to start');
  process.exit(1);
});

