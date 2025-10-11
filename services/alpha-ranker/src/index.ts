import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import EventSource from 'eventsource';
import { createInMemoryLastEventIdStore, subscribeJsonStream, sseQueue, sseRoute, resolveServiceUrl } from '@trenches/util';
import { registerGauge } from '@trenches/metrics';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { insertScore, listAuthorsByKeywords, getAuthorFeatures } from '@trenches/persistence';
import { createLogger } from '@trenches/logger';
import { LunarCrushStream } from './lunarCrush';
import type { LunarFeatures } from './lunarCrush';
type Candidate = { mint: string; name?: string; symbol?: string; buys60?: number; sells60?: number; uniques60?: number; lpSol?: number; spreadBps?: number; ageSec?: number; rugProb?: number };
type CandidateScore = { ts: number; mint: string; horizon: '10m' | '60m' | '24h'; score: number; features: Record<string, number> };

type Horizon = '10m' | '60m' | '24h';

const ALPHA_FEATURES: string[] = [
  'bias',
  'flow_norm',
  'lp_norm',
  'uniques_norm',
  'spread_inv',
  'age_inv',
  'rug_inv',
  'author_quality_mean',
  'author_quality_top',
  'author_mentions_norm',
  'lunar_boost'
];

type AlphaModelPayload = {
  status?: string;
  features?: string[];
  models?: Record<string, { weights?: number[]; status?: string; metrics?: Record<string, number>; train_size?: number; holdout_size?: number }>;
};

const MODEL_STATUS_LABELS = ['ok', 'degraded', 'missing', 'error', 'unknown'] as const;
const modelVersionGauge = registerGauge({ name: 'alpha_model_epoch_seconds', help: 'Alpha model created timestamp (unix seconds)' });
const modelStatusGauge = registerGauge({ name: 'alpha_model_status', help: 'Alpha model status indicator (1 if active, 0 otherwise)', labelNames: ['status'] });

let alphaWeights: { features: string[]; weights: Record<string, number[]>; status: string } | null = null;
let alphaModelPath: string | null = null;
let alphaModelWatcher: fs.FSWatcher | null = null;
let alphaModelStatus: typeof MODEL_STATUS_LABELS[number] = 'unknown';
let alphaModelDebounce: NodeJS.Timeout | null = null;

function setAlphaModelStatus(status: string, created?: string): void {
  const normalized = MODEL_STATUS_LABELS.includes(status as any) ? (status as typeof MODEL_STATUS_LABELS[number]) : 'unknown';
  const createdTs = created ? Date.parse(created) : Date.now();
  if (!Number.isNaN(createdTs)) {
    modelVersionGauge.set(Math.floor(createdTs / 1000));
  }
  for (const label of MODEL_STATUS_LABELS) {
    modelStatusGauge.labels({ status: label }).set(label === normalized ? 1 : 0);
  }
  alphaModelStatus = normalized;
}

setAlphaModelStatus('unknown');

function scheduleAlphaReload(reason: string): void {
  if (alphaModelDebounce) return;
  alphaModelDebounce = setTimeout(() => {
    alphaModelDebounce = null;
    logger.info({ path: alphaModelPath, reason }, 'alpha model change detected, reloading');
    alphaWeights = null;
    loadAlphaModel(true);
  }, 200);
}

function applyAlphaWatcher(filePath: string): void {
  if (!filePath) return;
  if (alphaModelWatcher) {
    alphaModelWatcher.close();
    alphaModelWatcher = null;
  }
  try {
    alphaModelWatcher = fs.watch(filePath, { persistent: false }, (event) => {
      if (event === 'change' || event === 'rename') {
        scheduleAlphaReload(event);
      }
    });
  } catch (err) {
    logger.warn({ err, filePath }, 'failed to watch alpha model file');
  }
}

function loadAlphaModel(force = false): void {
  try {
    const cfg = loadConfig();
    const configuredPath = (cfg as any).alpha?.modelPath ?? path.join('models', 'alpha_ranker_v1.json');
    if (alphaModelPath !== configuredPath) {
      alphaModelPath = configuredPath;
      if (alphaModelWatcher) {
        alphaModelWatcher.close();
        alphaModelWatcher = null;
      }
    }
    if (!fs.existsSync(configuredPath)) {
      if (force) {
        logger.warn({ configuredPath }, 'alpha model file missing; continuing with heuristics');
      }
      alphaWeights = null;
      setAlphaModelStatus('missing');
      return;
    }
    const raw = JSON.parse(fs.readFileSync(configuredPath, 'utf-8')) as AlphaModelPayload;
    const features = Array.isArray(raw.features) && raw.features.length > 0 ? raw.features : ALPHA_FEATURES;
    const weights: Record<string, number[]> = {};
    const models = raw.models ?? {};
    for (const [key, value] of Object.entries(models)) {
      if (Array.isArray(value?.weights) && value.weights.length === features.length) {
        weights[key] = value.weights;
      }
    }
    alphaWeights = {
      features,
      weights,
      status: raw.status ?? 'unknown'
    };
    logger.info({ status: alphaWeights.status, horizons: Object.keys(weights), path: configuredPath }, 'alpha model loaded');
    setAlphaModelStatus(alphaWeights.status, raw.created);
    applyAlphaWatcher(configuredPath);
  } catch (err) {
    logger.error({ err }, 'failed to load alpha model; falling back to heuristics');
    alphaWeights = null;
    setAlphaModelStatus('error');
  }
}

function ensureAlphaModel(): void {
  if (alphaWeights !== null) return;
  loadAlphaModel();
}

function reloadAlphaModel(): { status: string } {
  alphaWeights = null;
  loadAlphaModel(true);
  return { status: alphaModelStatus };
}

function selectWeightsForHorizon(horizon: Horizon): number[] | undefined {
  if (!alphaWeights) return undefined;
  const direct = alphaWeights.weights[horizon];
  if (Array.isArray(direct)) return direct;
  if (horizon === '24h') {
    return alphaWeights.weights['60m'] ?? alphaWeights.weights['10m'];
  }
  return undefined;
}

function computeFeatureRecord(
  c: Candidate,
  extras: { authorQualityMean: number; authorQualityTop: number; authorMentions: number; lunar: LunarFeatures }
): Record<string, number> {
  const buys = c.buys60 ?? 0;
  const sells = c.sells60 ?? 0;
  const flow = sells > 0 ? buys / Math.max(1, sells) : buys;
  const uniq = c.uniques60 ?? 0;
  const lp = c.lpSol ?? 0;
  const spread = Math.max(0, c.spreadBps ?? 0);
  const age = Math.max(0, c.ageSec ?? 0);
  const rug = typeof c.rugProb === 'number' ? Math.min(Math.max(c.rugProb, 0), 1) : 0.5;
  const authorMean = Math.min(Math.max(extras.authorQualityMean, 0), 1);
  const authorTop = Math.min(Math.max(extras.authorQualityTop, 0), 1);
  const authorMentionsNorm = Math.min(1, Math.max(0, extras.authorMentions) / 20);
  const lunarBoost = Math.min(0.2, Math.max(0, extras.lunar.boost));

  const record: Record<string, number> = {
    bias: 1,
    flow_norm: Math.min(1, flow / 4),
    lp_norm: Math.min(1, lp / 50),
    uniques_norm: Math.min(1, uniq / 25),
    spread_inv: 1 - Math.min(1, spread / 200),
    age_inv: 1 - Math.min(1, age / 1800),
    rug_inv: 1 - rug,
    author_quality_mean: authorMean,
    author_quality_top: authorTop,
    author_mentions_norm: authorMentionsNorm,
    lunar_boost: lunarBoost
  };
  return record;
}

function logisticScore(weights: number[], vector: number[]): number {
  const z = weights.reduce((acc, w, idx) => acc + w * (vector[idx] ?? 0), 0);
  return 1 / (1 + Math.exp(-z));
}

function computeFeaturesAndFallback(
  c: Candidate,
  extras: { authorQualityMean: number; authorQualityTop: number; authorMentions: number; lunar: LunarFeatures }
): { features: Record<string, number>; fallbackScore: number } {
  const features = computeFeatureRecord(c, extras);
  const qualityBoost = Math.min(0.15, extras.authorQualityMean * 0.1 + extras.authorQualityTop * 0.05);
  const baseLinear =
    1.4 * features.flow_norm +
    1.2 * features.uniques_norm +
    1.0 * features.lp_norm +
    0.6 * features.spread_inv +
    0.5 * features.age_inv +
    0.6 * features.rug_inv -
    1.8;
  const baseScore = 1 / (1 + Math.exp(-baseLinear));
  const fallback = Math.min(0.99, Math.max(0.01, baseScore + qualityBoost + features.lunar_boost));
  return { features, fallbackScore: fallback };
}

const logger = createLogger('alpha-ranker');
const offline = process.env.NO_RPC === '1';
const SCORE_BUFFER_LIMIT = 512;

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
  loadAlphaModel();
  const apiKeyEnv = (process.env.LUNARCRUSH_API_KEY ?? '').trim();
  const envHandshake = (process.env.LUNARCRUSH_MCP_SSE_URL ?? '').trim();
  const configHandshake = (cfg.lunarcrush?.mcpSseUrl ?? '').trim();
  const handshakeUrl = envHandshake || configHandshake || (apiKeyEnv ? 'https://lunarcrush.ai/sse?key=' + encodeURIComponent(apiKeyEnv) : null);
  const lunar = new LunarCrushStream({
    enabled: !offline && (cfg.lunarcrush?.enabled ?? true),
    handshakeUrl,
    apiKey: apiKeyEnv || undefined
  });
  try {
    lunar.start();
  } catch (err) {
    logger.error({ err }, 'failed to start lunarcrush stream');
  }
  const app = Fastify({ logger: false });
  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, { max: 240, timeWindow: '1 minute' });
  await app.register(fastifySse as any);

  const servicesRecord = cfg.services as Partial<Record<string, { port?: number }>>;
  const endpointsRecord = cfg.endpoints as Partial<Record<string, { baseUrl?: string }>> | undefined;
  const url = resolveServiceUrl(servicesRecord, endpointsRecord, 'safetyEngine', '/events/safe');
  const last: CandidateScore[] = [];
  let safetyClient: ReturnType<typeof subscribeJsonStream<Candidate>> | null = null;

  const startSafetyStream = () => {
    const eventStore = createInMemoryLastEventIdStore();
    safetyClient = subscribeJsonStream<Candidate>(url, {
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
        const lunarFeatures = lunar.evaluate(keywords);
        ensureAlphaModel();
        const { features, fallbackScore } = computeFeaturesAndFallback(candidate, {
          authorQualityMean,
          authorQualityTop,
          authorMentions,
          lunar: lunarFeatures
        });
        const featureNames = alphaWeights?.features ?? ALPHA_FEATURES;
        for (const horizon of horizons) {
          const weights = selectWeightsForHorizon(horizon as Horizon);
          let score = fallbackScore;
          if (weights && weights.length === featureNames.length) {
            const vector = featureNames.map((name) => features[name] ?? 0);
            score = logisticScore(weights, vector);
          }
          const clampedScore = Math.min(0.99, Math.max(0.01, score));
          const row: CandidateScore = { ts, mint: candidate.mint, horizon: horizon as Horizon, score: clampedScore, features };
          last.push(row);
          if (last.length > SCORE_BUFFER_LIMIT) {
            last.splice(0, last.length - SCORE_BUFFER_LIMIT);
          }
          try {
            insertScore(row);
          } catch (err) {
            logger.warn({ err, mint: candidate.mint }, 'failed to persist score');
          }
        }
      }
    });
  };
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

  app.post('/control/reload-models', async (_req, reply) => {
    const result = reloadAlphaModel();
    reply.send(result);
  });

  app.get('/healthz', async () => {
    const lunarStatus = lunar.getStatus();
    const baseStatus = offline ? 'degraded' : 'ok';
    const status = cfg.lunarcrush?.enabled === false || lunarStatus.status !== 'degraded' ? baseStatus : 'degraded';
    return { status, offline, alpha: cfg.alpha, lunarcrush: lunarStatus };
  });
  const listenPort = cfg.services.alphaRanker?.port ?? 0;
  const address = await app.listen({ host: '0.0.0.0', port: listenPort });
  logger.info({ address, port: listenPort }, 'alpha-ranker listening');

  if (!offline) {
    startSafetyStream();
  } else {
    logger.warn('NO_RPC=1; alpha-ranker running without safety stream subscription');
  }

  const disposeWatcher = () => {
    if (alphaModelWatcher) {
      alphaModelWatcher.close();
      alphaModelWatcher = null;
    }
  };

  process.on('SIGINT', () => {
    safetyClient?.dispose();
    disposeWatcher();
    lunar.stop();
  });
  process.on('SIGTERM', () => {
    safetyClient?.dispose();
    disposeWatcher();
    lunar.stop();
  });
}

bootstrap().catch((err) => { logger.error({ err }, 'alpha-ranker failed to start'); process.exit(1); });

