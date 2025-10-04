import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig, TrenchesConfig } from '@trenches/config';
import { pathToFileURL } from 'url';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter, registerGauge } from '@trenches/metrics';
import { listRecentSocialPosts, upsertAuthorFeature } from '@trenches/persistence';

type Embedder = {
  name: string;
  fallback: boolean;
  embed(texts: string[]): Promise<number[][]>;
};

type JobStats = {
  authorsUpdated: number;
  avgQuality: number;
  postsProcessed: number;
  fallback: boolean;
};

const jobRunsTotal = registerCounter({ name: 'features_job_runs_total', help: 'Total nightly feature runs' });
const postsEmbeddedTotal = registerCounter({ name: 'features_job_posts_embedded_total', help: 'Posts embedded by features job' });
const authorQualityAvg = registerGauge({ name: 'author_quality_avg', help: 'Average author quality from last run' });

const logger = createLogger('features-job');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';

let embedderPromise: Promise<Embedder> | null = null;
let lastStats: { ts: number; authors: number; avgQuality: number; fallback: boolean } = { ts: 0, authors: 0, avgQuality: 0, fallback: true };

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 128);
}

function hashEmbed(text: string, dim = 128): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  return vec;
}

async function createEmbedder(modelName: string): Promise<Embedder> {
  if (embedderPromise) {
    return embedderPromise;
  }
  embedderPromise = (async () => {
    try {
      // Use eval'd dynamic import to avoid TypeScript resolving types at build time
      const dynImport: any = (eval as any)('import');
      const transformers: any = await dynImport('@xenova/transformers').catch(() => null);
      if (transformers && typeof transformers.pipeline === 'function') {
        const extractor: any = await transformers.pipeline('feature-extraction', modelName, { quantized: true });
        logger.info({ modelName }, 'loaded @xenova/transformers embedder');
        return {
          name: modelName,
          fallback: false,
          embed: async (texts: string[]) => {
            const outputs: number[][] = [];
            for (const text of texts) {
              try {
                const result: any = await extractor(text, { pooling: 'mean', normalize: true });
                if (Array.isArray(result)) {
                  const arr = Array.isArray(result[0]) ? result[0] : result;
                  outputs.push(arr.map((x: number) => Number(x)));
                } else if (Array.isArray(result.data)) {
                  outputs.push(result.data.map((x: number) => Number(x)));
                } else {
                  outputs.push(hashEmbed(text));
                }
              } catch (err) {
                logger.warn({ err }, 'failed to embed with transformer; falling back to hash for sample');
                outputs.push(hashEmbed(text));
              }
            }
            return outputs;
          }
        } satisfies Embedder;
      }
    } catch (err) {
      logger.warn({ err }, 'transformer embedder unavailable; using hash fallback');
    }
    return {
      name: 'hash-128',
      fallback: true,
      embed: async (texts: string[]) => texts.map((t) => hashEmbed(t))
    } satisfies Embedder;
  })();
  return embedderPromise;
}

export async function runFeaturesJobOnce(config?: TrenchesConfig, sharedEmbedder?: Embedder, now: number = Date.now()): Promise<JobStats> {
  const cfg = config ?? loadConfig();
  const jobCfg = cfg.featuresJob ?? { enabled: true, intervalMs: 86_400_000, embedder: 'bge-small-en', lookbackHours: 24, minPostsPerAuthor: 5 };
  if (!jobCfg.enabled) {
    return { authorsUpdated: 0, avgQuality: 0, postsProcessed: 0, fallback: true };
  }
  const embedder = sharedEmbedder ?? (await createEmbedder(jobCfg.embedder ?? 'bge-small-en'));
  jobRunsTotal.inc();
  const since = now - Math.max(1, jobCfg.lookbackHours) * 60 * 60 * 1000;
  const posts = listRecentSocialPosts(since).filter((p) => p.author && p.text);
  if (posts.length === 0) {
    authorQualityAvg.set(0);
    lastStats = { ts: now, authors: 0, avgQuality: 0, fallback: embedder.fallback };
    return { authorsUpdated: 0, avgQuality: 0, postsProcessed: 0, fallback: embedder.fallback };
  }
  const batches: number[][] = await embedder.embed(posts.map((p) => p.text));
  const authorMap = new Map<string, { count: number; sum: number[]; tokens: Set<string> }>();
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const vec = batches[i] ?? hashEmbed(post.text);
    const author = post.author;
    if (!authorMap.has(author)) {
      authorMap.set(author, { count: 0, sum: new Array(vec.length).fill(0), tokens: new Set<string>() });
    }
    const entry = authorMap.get(author)!;
    if (entry.sum.length !== vec.length) {
      entry.sum = new Array(vec.length).fill(0);
    }
    entry.count += 1;
    for (let j = 0; j < vec.length; j += 1) {
      entry.sum[j] += vec[j];
    }
    const tokens = tokenize(post.text);
    for (const tok of tokens) {
      entry.tokens.add(tok);
      if (entry.tokens.size >= 256) break;
    }
  }

  const minPosts = Math.max(1, jobCfg.minPostsPerAuthor ?? 5);
  let authorsUpdated = 0;
  let qualitySum = 0;
  for (const [author, entry] of authorMap.entries()) {
    if (entry.count < minPosts) continue;
    const countWeight = Math.min(1, Math.log1p(entry.count) / Math.log1p(minPosts * 4));
    const meanVec = entry.sum.map((v) => v / Math.max(1, entry.count));
    const meanNorm = Math.sqrt(meanVec.reduce((acc, v) => acc + v * v, 0));
    const diversityScore = Math.min(1, Math.max(0, 1 - meanNorm));
    const lexicalScore = Math.min(1, entry.tokens.size / 100);
    const quality = Math.min(1, 0.6 * countWeight + 0.25 * diversityScore + 0.15 * lexicalScore);
    upsertAuthorFeature({ author, quality, posts24h: entry.count, lastCalcTs: now });
    authorsUpdated += 1;
    qualitySum += quality;
  }

  const avgQuality = authorsUpdated > 0 ? qualitySum / authorsUpdated : 0;
  postsEmbeddedTotal.inc(posts.length);
  authorQualityAvg.set(avgQuality);
  lastStats = { ts: now, authors: authorsUpdated, avgQuality, fallback: embedder.fallback };
  return { authorsUpdated, avgQuality, postsProcessed: posts.length, fallback: embedder.fallback };
}

async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const jobCfg = cfg.featuresJob ?? { enabled: true, intervalMs: 86_400_000, embedder: 'bge-small-en', lookbackHours: 24, minPostsPerAuthor: 5 };
  const featuresEnabled = jobCfg.enabled !== false;
  const embedder = featuresEnabled ? await createEmbedder(jobCfg.embedder ?? 'bge-small-en') : await createEmbedder('hash');

  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 60, timeWindow: '1 minute' });

  let timer: NodeJS.Timeout | null = null;
  const runJob = async () => {
    try {
      const stats = await runFeaturesJobOnce(cfg, embedder);
      logger.info({ authors: stats.authorsUpdated, avgQuality: stats.avgQuality.toFixed(3), posts: stats.postsProcessed }, 'features job run complete');
    } catch (err) {
      logger.error({ err }, 'features job run failed');
    }
  };

  if (featuresEnabled && !offline) {
    void runJob();
    timer = setInterval(() => { void runJob(); }, Math.max(60_000, jobCfg.intervalMs ?? 86_400_000));
  } else if (!featuresEnabled) {
    logger.warn('features job disabled via config');
  } else {
    logger.warn('NO_RPC=1; features job paused');
  }

  app.get('/healthz', async () => ({
    status: !featuresEnabled ? 'disabled' : offline ? 'degraded' : 'ok',
    detail: !featuresEnabled ? 'config_disabled' : offline ? 'offline' : 'running',
    offline,
    providersOff,
    lastRunTs: lastStats.ts || null,
    authorsUpdated: lastStats.authors,
    avgQuality: lastStats.avgQuality,
    embedder: { name: embedder.name, fallback: embedder.fallback }
  }));

  app.get('/metrics', async (_req: any, reply: any) => {
    const registry = getRegistry();
    reply.header('Content-Type', registry.contentType);
    reply.send(await registry.metrics());
  });

  const port = cfg.services?.featuresJob?.port ?? 4020;
  const address = await app.listen({ host: '0.0.0.0', port });
  logger.info({ address, intervalMs: jobCfg.intervalMs }, 'features job service listening');

  const shutdown = async (reason: string) => {
    logger.warn({ reason }, 'shutting down features job');
    try {
      if (timer) clearInterval(timer);
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'features job failed to start');
  process.exit(1);
});
