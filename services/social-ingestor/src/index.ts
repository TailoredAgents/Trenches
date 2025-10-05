import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifySse from 'fastify-sse-v2';
import { loadConfig } from '@trenches/config';
import { sseQueue, sseRoute } from '@trenches/util';
import { createLogger } from '@trenches/logger';
import { getRegistry, registerCounter } from '@trenches/metrics';
import { SocialPost } from '@trenches/shared';
import { SocialEventBus } from './eventBus';
import { SourceStatus, SocialSource } from './types';
import { createNeynarSource } from './providers/neynar';
import { createBlueskySource } from './providers/bluesky';
import { createRedditSource } from './providers/reddit';
import { createTelegramSource } from './providers/telegram';
import { createGdeltSource } from './providers/gdelt';

const logger = createLogger('social-ingestor');
const offline = process.env.NO_RPC === '1';
const providersOff = process.env.DISABLE_PROVIDERS === '1';

async function bootstrap() {
  const config = loadConfig();
  const app = Fastify({ logger: false });
  const bus = new SocialEventBus();
  const statusMap = new Map<string, SourceStatus>();

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 300,
    timeWindow: '1 minute'
  });
  await app.register(fastifySse as any);

  const postsCounter = registerCounter({
    name: 'social_posts_ingested_total',
    help: 'Total social posts ingested',
    labelNames: ['source']
  });

  const emitter = {
    emit: (event: 'post', payload: SocialPost) => {
      if (event === 'post') {
        postsCounter.inc({ source: payload.platform });
        bus.emitPost(payload);
      }
    }
  };

  const onStatus = (name: string, status: SourceStatus) => {
    statusMap.set(name, status);
  };

  const neynarSource = createNeynarSource(
    config.social.neynar,
    { emitter, onStatus },
    { apiKey: process.env.NEYNAR_API_KEY, baseUrl: config.dataProviders.neynarBaseUrl }
  );

  const blueskySource = createBlueskySource(
    config.social.bluesky,
    { emitter, onStatus },
    { streamUrl: config.dataProviders.blueskyJetstreamUrl, token: process.env.BLUESKY_JETSTREAM_TOKEN }
  );

  const redditSource = createRedditSource(
    config.social.reddit,
    { emitter, onStatus },
    {
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN
    }
  );

  const telegramSource = createTelegramSource(
    config.social.telegram,
    { emitter, onStatus },
    {
      apiId: process.env.TELEGRAM_API_ID,
      apiHash: process.env.TELEGRAM_API_HASH,
      botToken: process.env.TELEGRAM_BOT_TOKEN
    }
  );

  const gdeltSource = createGdeltSource(
    config.social.gdelt,
    { emitter, onStatus },
    { baseUrl: config.dataProviders.gdeltPulseUrl }
  );

  const sourceConfigs: Array<{ name: string; instance: SocialSource; requiredKeys: string[] }> = [
    { name: neynarSource.name, instance: neynarSource, requiredKeys: ['NEYNAR_API_KEY'] },
    { name: blueskySource.name, instance: blueskySource, requiredKeys: ['BLUESKY_JETSTREAM_TOKEN'] },
    { name: redditSource.name, instance: redditSource, requiredKeys: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN'] },
    { name: telegramSource.name, instance: telegramSource, requiredKeys: ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_BOT_TOKEN'] },
    { name: gdeltSource.name, instance: gdeltSource, requiredKeys: [] }
  ];
  const startedSources = new Set<string>();

  for (const { name, instance } of sourceConfigs) {
    statusMap.set(name, instance.status());
  }

  app.get('/healthz', async () => {
    const summary = Array.from(statusMap.entries()).map(([name, status]) => ({ name, status }));
    const anyRunning = summary.some((entry) => entry.status.state === 'running');
    const bluesky = summary.find((s) => s.name === 'bluesky')?.status;
    const degraded = offline || providersOff || !anyRunning;
    const detail = offline ? 'offline' : providersOff ? 'providers_disabled' : anyRunning ? 'running' : 'no_sources_active';
    return {
      status: degraded ? 'degraded' : 'ok',
      detail,
      offline,
      providersOff,
      sources: summary,
      providers: {
        bluesky: bluesky ?? { state: 'idle', detail: 'not_started' }
      }
    };
  });

  app.get('/status', async () => {
    return {
      updatedAt: new Date().toISOString(),
      sources: Array.from(statusMap.entries()).map(([name, status]) => ({ name, status }))
    };
  });

  app.get('/metrics', async (_, reply) => {
    try {
      const metrics = await getRegistry().metrics();
      reply.header('Content-Type', getRegistry().contentType);
      reply.send(metrics);
    } catch (err) {
      reply.code(500).send((err as Error).message);
    }
  });

  app.get('/events/social', async (_request, reply) => {
    const stream = sseQueue<SocialPost>();
    const unsubscribe = bus.on('post', (payload) => {
      stream.push(payload);
    });
    sseRoute(reply, stream.iterator, () => {
      unsubscribe();
      stream.close();
    });
  });

  const address = await app.listen({ port: config.services.socialIngestor.port, host: '0.0.0.0' });
  logger.info({ address }, 'social ingestor listening');

  for (const { name, instance, requiredKeys } of sourceConfigs) {
    const hasKeys = requiredKeys.every((key) => {
      const value = process.env[key];
      return typeof value === 'string' && value.trim().length > 0;
    });
    if (offline) {
      statusMap.set(name, { state: 'idle', detail: 'offline' });
      continue;
    }
    if (providersOff) {
      statusMap.set(name, { state: 'idle', detail: 'providers_disabled' });
      continue;
    }
    if (!hasKeys) {
      statusMap.set(name, { state: 'idle', detail: 'missing_credentials' });
      continue;
    }
    try {
      await instance.start();
      startedSources.add(name);
      statusMap.set(name, instance.status());
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.error({ err, source: name }, 'failed to start source');
      statusMap.set(name, { state: 'error', detail });
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down social ingestor');
    try {
      for (const { name, instance } of sourceConfigs) {
        if (!startedSources.has(name)) continue;
        await instance.stop();
      }
    } catch (err) {
      logger.error({ err }, 'failed to stop sources');
    }
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    process.exit(0);
  }
}

bootstrap().catch((err) => {
  logger.error({ err }, 'social ingestor failed to start');
});

