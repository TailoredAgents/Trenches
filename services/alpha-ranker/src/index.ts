import 'dotenv/config';
import EventSource from 'eventsource';
import { createInMemoryLastEventIdStore, subscribeJsonStream, sseQueue, sseRoute } from '@trenches/util';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { insertScore } from '@trenches/persistence';
import { createLogger } from '@trenches/logger';

type Candidate = { mint: string; buys60?: number; sells60?: number; uniques60?: number; lpSol?: number; spreadBps?: number; ageSec?: number; rugProb?: number };
type CandidateScore = { ts: number; mint: string; horizon: '10m' | '60m' | '24h'; score: number; features: Record<string, number> };

const logger = createLogger('alpha-ranker');

async function bootstrap() {
  const cfg = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  const url = `http://127.0.0.1:${cfg.services.safetyEngine.port}/events/safe`;
  const last: CandidateScore[] = [];
  const eventStore = createInMemoryLastEventIdStore();
  const sse = subscribeJsonStream<Candidate>(url, {
    lastEventIdStore: eventStore,
    eventSourceFactory: (target, init) => new EventSource(target, { headers: init?.headers }) as any,
    onOpen: () => logger.info({ url }, 'connected to safety stream'),
    onError: (err, attempt) => logger.error({ err, attempt }, 'safety stream error'),
    onParseError: (err) => logger.error({ err }, 'failed to parse candidate'),
    onMessage: async (c) => {
      const s = scoreCandidate(c);
      const ts = Date.now();
      for (const h of (cfg.alpha?.horizons ?? ['10m'])) {
        const row: CandidateScore = { ts, mint: c.mint, horizon: h as any, score: s, features: {} };
        last.push(row);
        try {
          insertScore(row);
        } catch (err) {
          logger.warn({ err, mint: c.mint }, 'failed to persist score');
        }
      }
    }
  });

  function scoreCandidate(c: Candidate): number {
    const buys = c.buys60 ?? 0;
    const sells = c.sells60 ?? 0;
    const flow = sells > 0 ? buys / sells : buys;
    const uniq = c.uniques60 ?? 0;
    const lp = c.lpSol ?? 0;
    const spr = c.spreadBps ?? 0;
    const age = c.ageSec ?? 0;
    const rug = c.rugProb ?? 0.5;
    const sFlow = Math.min(1, flow / 4);
    const sUniq = Math.min(1, uniq / 25);
    const sLp = Math.min(1, lp / 40);
    const sSpread = 1 - Math.min(1, spr / 200);
    const sAge = 1 - Math.min(1, age / 1800);
    const sRug = 1 - rug;
    let z = 1.4*sFlow + 1.2*sUniq + 1.0*sLp + 0.6*sSpread + 0.5*sAge + 0.6*sRug - 1.8;
    const s = 1 / (1 + Math.exp(-z));
    return s;
  }

  process.on('SIGINT', () => sse.dispose());
  process.on('SIGTERM', () => sse.dispose());

  app.get('/events/scores', async (_req, reply) => {
    const stream = sseQueue<CandidateScore>();
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      const row = last.shift();
      if (row) {
        stream.push(row);
      }
    }, 100);
    sseRoute(reply, stream.iterator, () => {
      stopped = true;
      clearInterval(interval);
      stream.close();
    });
  });

  app.get('/healthz', async () => ({ status: 'ok', alpha: cfg.alpha }));
  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  logger.info({ address }, 'alpha-ranker listening');
}

bootstrap().catch((err) => { logger.error({ err }, 'alpha-ranker failed to start'); process.exit(1); });
