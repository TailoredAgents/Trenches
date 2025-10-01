import 'dotenv/config';
import EventSource from 'eventsource';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { insertScore } from '@trenches/persistence';

type Candidate = { mint: string; buys60?: number; sells60?: number; uniques60?: number; lpSol?: number; spreadBps?: number; ageSec?: number; rugProb?: number };
type CandidateScore = { ts: number; mint: string; horizon: '10m' | '60m' | '24h'; score: number; features: Record<string, number> };

async function bootstrap() {
  const cfg = loadConfig();
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  const url = `http://127.0.0.1:${cfg.services.safetyEngine.port}/events/safe`;
  const source = new EventSource(url);
  const subscribers = new Set<(s: CandidateScore) => void>();
  const last: CandidateScore[] = [];

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

  source.onmessage = async (evt) => {
    try {
      const c = JSON.parse(evt.data) as Candidate;
      const s = scoreCandidate(c);
      const ts = Date.now();
      for (const h of (cfg.alpha?.horizons ?? ['10m'])) {
        const row: CandidateScore = { ts, mint: c.mint, horizon: h as any, score: s, features: {} };
        last.push(row);
        try { insertScore(row); } catch {}
        for (const sub of subscribers) sub(row);
      }
    } catch {}
  };

  app.get('/events/scores', async (req, reply) => {
    const iterator = (async function* () {
      while (true) {
        const row = last.shift();
        if (row) {
          yield { data: JSON.stringify(row) };
        } else {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    })();
    reply.sse(iterator);
  });

  app.get('/healthz', async () => ({ status: 'ok', alpha: cfg.alpha }));
  const address = await app.listen({ host: '0.0.0.0', port: 0 });
  console.log('alpha-ranker listening at', address);
}

bootstrap().catch((err) => { console.error('alpha-ranker failed to start', err); process.exit(1); });
