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
import { SourceStatus } from './types';
import { createNeynarSource } from './providers/neynar';
import { createBlueskySource } from './providers/bluesky';
import { createRedditSource } from './providers/reddit';
import { createTelegramSource } from './providers/telegram';
import { createGdeltSource } from './providers/gdelt';

const logger = createLogger('social-ingestor');

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

  const sources = [neynarSource, blueskySource, redditSource, telegramSource, gdeltSource];

  for (const source of sources) {
    statusMap.set(source.name, source.status());
  }

  for (const source of sources) {
    try {
      await source.start();
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, source: source.name }, 'failed to start source');
    }
  }

  app.get('/healthz', async () => {
    const summary = Array.from(statusMap.entries()).map(([name, status]) => ({ name, status }));
    const anyRunning = summary.some((entry) => entry.status.state === 'running');
    const bluesky = summary.find((s) => s.name === 'bluesky')?.status;
    return {
      status: anyRunning ? 'ok' : 'degraded',
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

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down social ingestor');
    try {
      for (const source of sources) {
        await source.stop();
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
  process.exit(1);
});

