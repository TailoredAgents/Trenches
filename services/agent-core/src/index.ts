try { require('dotenv').config(); } catch {}
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { startMetricsServer } from '@trenches/metrics';
import {
  closeDb,
  getDb,
  recordHeartbeat,
  shutdownParquetWriters,
  getOpenPositionsCount,
  listOpenPositions,
  fetchActiveTopicWindows,
  getDailyRealizedPnlSince,
  listRecentCandidates
} from '@trenches/persistence';
import { Snapshot } from '@trenches/shared';

const logger = createLogger('agent-core');

async function bootstrap() {
  const config = loadConfig();
  const metricsServer = startMetricsServer();
  const db = getDb();
  db.prepare('SELECT 1').get();

  const app = Fastify({ logger: false });

  await app.register(helmet as any, { global: true });
  await app.register(rateLimit as any, {
    max: 600,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1', '::1']
  });

  let killSwitchArmed = false;
  let modeOverride: 'SIM' | 'SHADOW' | 'SEMI' | 'FULL' | undefined = undefined;
  const sseClients = new Set<import('fastify').FastifyReply>();

  app.get('/healthz', async () => {
    try {
      db.prepare('SELECT 1').get();
      recordHeartbeat('agent-core', 'OK');
      return {
        status: 'ok',
        mode: modeOverride ?? config.mode,
        killSwitchArmed,
        db: 'up'
      };
    } catch (err) {
      logger.error({ err }, 'health check db failure');
      recordHeartbeat('agent-core', 'ERROR', (err as Error).message);
      return {
        status: 'degraded',
        mode: modeOverride ?? config.mode,
        killSwitchArmed,
        db: 'down'
      };
    }
  });

  app.get('/config/safe', async () => {
    const cfg = { ...config };
    delete cfg.security.killSwitchToken;
    if (modeOverride) {
      (cfg as any).mode = modeOverride;
    }
    return cfg;
  });

  app.get('/snapshot', async () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const openCount = getOpenPositionsCount();
    const status: Snapshot['status'] = killSwitchArmed ? 'PAUSED' : openCount > 0 ? 'IN_TRADE' : 'SCANNING';

    const pnlDay = getDailyRealizedPnlSince(dayAgo);
    const pnlWeek = getDailyRealizedPnlSince(weekAgo);
    const pnlMonth = getDailyRealizedPnlSince(monthAgo);

    const activeWindows = fetchActiveTopicWindows(now.toISOString());
    const topics = activeWindows.map((w) => ({
      topicId: w.topicId,
      label: w.topicId,
      sss: w.sss,
      secondsLeft: Math.max(0, Math.floor((new Date(w.expiresAt).getTime() - now.getTime()) / 1000))
    }));

    const candidates = listRecentCandidates(30).map((c) => ({
      mint: c.mint,
      name: c.name,
      ocrs: c.ocrs,
      lp: c.lp,
      buys: c.buys,
      sells: c.sells,
      uniques: c.uniques,
      safetyOk: c.safetyOk
    }));

    const positions = listOpenPositions().map((p) => ({
      mint: p.mint,
      qty: p.quantity,
      avg: p.averagePrice,
      upl: p.unrealizedPnl,
      targets: config.ladders.multiplierPercents,
      trailPct: config.ladders.trailPct
    }));

    const snapshot: Snapshot = {
      status,
      pnl: { day: pnlDay, week: pnlWeek, month: pnlMonth },
      topics,
      candidates,
      positions,
      risk: { exposurePct: 0, dailyLossPct: 0 },
      sizing: { equity: 0, free: 0, tier: 'n/a', base: 0, final: 0 }
    };
    return snapshot;
  });

  app.post('/kill', async (request, reply) => {
    if (!config.security.killSwitchToken) {
      reply.code(501).send({ status: 'disabled' });
      return;
    }
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : (request.body as { token?: string } | undefined)?.token;
    if (token !== config.security.killSwitchToken) {
      reply.code(403).send({ status: 'forbidden' });
      return;
    }
    killSwitchArmed = true;
    logger.warn('kill switch engaged, shutting down agents');
    reply.code(202).send({ status: 'shutting-down' });
    setImmediate(() => shutdown('kill-switch'));
  });

  app.get('/events/agent', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    sseClients.add(reply);
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    send('hello', { status: 'ok' });
    const ping = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15000);
    request.raw.on('close', () => {
      clearInterval(ping);
      sseClients.delete(reply);
    });
    return reply;
  });

  // Control endpoints (simple token auth via killSwitchToken)
  app.post('/control/pause', async (request, reply) => {
    if (!config.security.killSwitchToken) {
      reply.code(501).send({ status: 'disabled' });
      return;
    }
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : (request.body as { token?: string } | undefined)?.token;
    if (token !== config.security.killSwitchToken) {
      reply.code(403).send({ status: 'forbidden' });
      return;
    }
    killSwitchArmed = true;
    recordHeartbeat('agent-core', 'PAUSED', 'paused via control API');
    reply.code(202).send({ status: 'paused' });
  });

  app.post('/control/resume', async (request, reply) => {
    if (!config.security.killSwitchToken) {
      reply.code(501).send({ status: 'disabled' });
      return;
    }
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : (request.body as { token?: string } | undefined)?.token;
    if (token !== config.security.killSwitchToken) {
      reply.code(403).send({ status: 'forbidden' });
      return;
    }
    killSwitchArmed = false;
    recordHeartbeat('agent-core', 'OK', 'resumed via control API');
    reply.code(202).send({ status: 'resumed' });
  });

  app.post('/control/mode', async (request, reply) => {
    const body = (request.body as { mode?: string; token?: string }) ?? {};
    const next = String(body.mode || '').toUpperCase();
    if (!['SIM', 'SHADOW', 'SEMI', 'FULL'].includes(next)) {
      reply.code(400).send({ error: 'invalid_mode' });
      return;
    }
    if (config.security.killSwitchToken) {
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : (request.body as { token?: string } | undefined)?.token;
      if (token !== config.security.killSwitchToken) {
        reply.code(403).send({ status: 'forbidden' });
        return;
      }
    }
    modeOverride = next as typeof modeOverride;
    recordHeartbeat('agent-core', 'OK', `mode set to ${modeOverride}`);
    reply.code(202).send({ status: 'ok', mode: modeOverride });
  });

  app.post('/control/flatten', async (request, reply) => {
    if (!config.security.killSwitchToken) {
      reply.code(501).send({ status: 'disabled' });
      return;
    }
    const auth = request.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : (request.body as { token?: string } | undefined)?.token;
    if (token !== config.security.killSwitchToken) {
      reply.code(403).send({ status: 'forbidden' });
      return;
    }
    // Probe wallet readiness from policy-engine
    try {
      const pe = await fetch(`http://127.0.0.1:${config.services.policyEngine.port}/healthz`);
      const health = (await pe.json()) as { status?: string; wallet?: string };
      if (health.status === 'awaiting_credentials' || health.wallet === 'missing_keystore') {
        reply.code(503).send({ status: 'awaiting_credentials', detail: 'wallet_unavailable' });
        return;
      }
    } catch {
      // If policy engine not reachable, report unavailable
      reply.code(503).send({ status: 'degraded', detail: 'policy_engine_unreachable' });
      return;
    }
    // Forward to position-manager
    try {
      const res = await fetch(`http://127.0.0.1:${config.services.positionManager.port}/control/flatten`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.security.killSwitchToken}` }
      });
      reply.code(res.status).send(await res.json());
    } catch (err) {
      reply.code(502).send({ status: 'error', detail: 'position_manager_unreachable' });
    }
  });

  const address = await app.listen({ port: config.services.agentCore.port, host: '0.0.0.0' });
  logger.info({ address, mode: config.mode }, 'agent core listening');
  recordHeartbeat('agent-core', 'STARTED', 'Agent core booted');

  const heartbeatTimer = setInterval(() => {
    try {
      recordHeartbeat('agent-core', killSwitchArmed ? 'PAUSED' : 'OK');
    } catch (err) {
      logger.error({ err }, 'failed to write heartbeat');
    }
  }, 60_000);

  async function shutdown(reason: string) {
    logger.warn({ reason }, 'shutting down agent core');
    clearInterval(heartbeatTimer);
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'failed to close fastify');
    }
    try {
      await new Promise<void>((resolve, reject) => {
        metricsServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      logger.error({ err }, 'failed to close metrics server');
    }
    try {
      await shutdownParquetWriters();
    } catch (err) {
      logger.error({ err }, 'failed to close parquet writers');
    }
    try {
      closeDb();
    } catch (err) {
      logger.error({ err }, 'failed to close sqlite');
    }
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'agent core failed to start');
  process.exit(1);
});

