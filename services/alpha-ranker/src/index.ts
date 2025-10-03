import 'dotenv/config';
import EventSource from 'eventsource';
import { createInMemoryLastEventIdStore, subscribeJsonStream, sseQueue, sseRoute } from '@trenches/util';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { insertScore, listAuthorsByKeywords, getAuthorFeatures } from '@trenches/persistence';
import { createLogger } from '@trenches/logger';

type Candidate = { mint: string; name?: string; symbol?: string; buys60?: number; sells60?: number; uniques60?: number; lpSol?: number; spreadBps?: number; ageSec?: number; rugProb?: number };
type CandidateScore = { ts: number; mint: string; horizon: '10m' | '60m' | '24h'; score: number; features: Record<string, number> };

const logger = createLogger('alpha-ranker');

function extractAlphaKeywords(candidate: Candidate): string[] {
  const keywords = new Set<string>();
  const symbol = (candidate.symbol ?? '').toLowerCase();
  if (symbol.length > 1) {
    keywords.add(symbol);
    if (!symbol.startsWith('$') && symbol.length > 2) {
      keywords.add(`$${symbol}`);
    }
  }
  const name = (candidate.name ?? '').toLowerCase();
  if (name) {
    for (const part of name.split(/[^a-z0-9]+/)) {
      if (part.length > 2) {
        keywords.add(part);
      }
    }
  }
  return Array.from(keywords);
}

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
    onMessage: async (candidate) => {
      const ts = Date.now();
      const horizons = cfg.alpha?.horizons ?? ['10m', '60m', '24h'];
      const keywords = extractAlphaKeywords(candidate);
      const authors = keywords.length > 0 ? listAuthorsByKeywords(keywords, ts - 60 * 60 * 1000, 200) : [];
      const authorMentions = authors.length;
      const featureRows = authorMentions > 0 ? getAuthorFeatures(authors) : {};
      const values = authorMentions > 0 ? authors
        .map((author) => featureRows[author]?.quality)
        .filter((value): value is number => typeof value === 'number') : [];
      let authorQualityMean = 0;
      let authorQualityTop = 0;
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        authorQualityMean = sum / values.length;
        const sorted = values.slice().sort((a, b) => b - a);
        const topSlice = sorted.slice(0, Math.min(5, sorted.length));
        authorQualityTop = topSlice.reduce((a, b) => a + b, 0) / topSlice.length;
      } else if (authorMentions > 0) {
        authorQualityMean = Math.min(1, Math.log1p(authorMentions) / Math.log1p(50)) * 0.4;
      }
      const result = scoreCandidate(candidate, { authorQualityMean, authorQualityTop, authorMentions });
      for (const h of horizons) {
        const row: CandidateScore = { ts, mint: candidate.mint, horizon: h as any, score: result.score, features: result.features };
        last.push(row);
        try {
          insertScore(row);
        } catch (err) {
          logger.warn({ err, mint: candidate.mint }, 'failed to persist score');
        }
      }
    }
  });

  function scoreCandidate(c: Candidate, extras: { authorQualityMean: number; authorQualityTop: number; authorMentions: number }): { score: number; features: Record<string, number> } {
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
    let z = 1.4 * sFlow + 1.2 * sUniq + 1.0 * sLp + 0.6 * sSpread + 0.5 * sAge + 0.6 * sRug - 1.8;
    const baseScore = 1 / (1 + Math.exp(-z));
    const qualityBoost = Math.min(0.15, extras.authorQualityMean * 0.1 + extras.authorQualityTop * 0.05);
    const finalScore = Math.min(0.99, Math.max(0.01, baseScore + qualityBoost));
    return {
      score: finalScore,
      features: {
        flow_ratio: sFlow,
        uniques_norm: sUniq,
        lp_norm: sLp,
        spread_norm: sSpread,
        age_norm: sAge,
        rug_inverse: sRug,
        author_quality_mean: extras.authorQualityMean,
        author_quality_topk: extras.authorQualityTop,
        author_mentions: extras.authorMentions
      }
    };
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
