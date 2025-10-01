import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { upsertPrice } from '@trenches/persistence';

async function fetchSolUsd(): Promise<number | null> {
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return null;
  try {
    const url = 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112';
    const resp = await fetch(url, { headers: { 'X-API-KEY': apiKey, accept: 'application/json' } as any });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { data?: { value?: number } };
    const v = j?.data?.value;
    return typeof v === 'number' ? v : null;
  } catch { return null; }
}

async function bootstrap() {
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 60, timeWindow: '1 minute' });
  app.get('/healthz', async () => ({ status: 'ok' }));
  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  console.log('price-updater listening at', address);

  const interval = Math.max(30000, Number(process.env.PRICE_UPDATER_INTERVAL_MS ?? '45000'));
  setInterval(async () => {
    const usd = await fetchSolUsd();
    if (typeof usd === 'number') {
      upsertPrice(Date.now(), 'SOL', usd);
    }
  }, interval).unref();
}

bootstrap().catch((err) => { console.error('price-updater failed to start', err); process.exit(1); });

