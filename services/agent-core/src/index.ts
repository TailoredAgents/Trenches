import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { startMetricsServer, registerGauge } from '@trenches/metrics';
  import {
    closeDb,
    getDb,
    recordHeartbeat,
    shutdownParquetWriters,
    getOpenPositionsCount,
    listOpenPositions,
    fetchActiveTopicWindows,
    getDailyRealizedPnlSince,
    listRecentCandidates,
    getPnLSummary
  } from '@trenches/persistence';
import { Snapshot } from '@trenches/shared';

const logger = createLogger('agent-core');

async function bootstrap() {
  const config = loadConfig();
  const controlsEnabled = Boolean(config.security.killSwitchToken);
  const metricsServer = startMetricsServer();
  const lagP50 = registerGauge({ name: 'migration_to_candidate_lag_ms', help: 'Lag between migration and candidate (ms)', labelNames: ['quantile'] });
  const lagHist = (await import('@trenches/metrics')).registerHistogram({ name: 'migration_to_candidate_lag_hist_ms', help: 'Lag histogram', buckets: [50, 100, 200, 400, 900, 2000, 5000] });
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
        controlsEnabled,
        db: 'up'
      };
    } catch (err) {
      logger.error({ err }, 'health check db failure');
      recordHeartbeat('agent-core', 'ERROR', (err as Error).message);
      return {
        status: 'degraded',
        mode: modeOverride ?? config.mode,
        killSwitchArmed,
        controlsEnabled,
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

    // Prices: SOL/USD freshness from SQLite
    let prices = { solUsdAgeSec: 0, ok: false } as { solUsdAgeSec: number; ok: boolean };
    try {
      const row = db
        .prepare('SELECT ts FROM prices WHERE symbol = ? ORDER BY ts DESC LIMIT 1')
        .get('SOL') as { ts?: number } | undefined;
      if (row?.ts) {
        const ageSec = Math.max(0, Math.floor((Date.now() - row.ts) / 1000));
        const warn = (config as any).priceUpdater?.staleWarnSec ?? 300;
        prices = { solUsdAgeSec: ageSec, ok: ageSec <= warn };
      }
    } catch {}

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

    // Phase A additions: migrations and RugGuard stats
    let latestMigrations: Array<{ ts: number; mint: string; pool: string; source: string }> = [];
    let lag = { p50: 0, p95: 0 };
    let rug = { passRate: 0, avgRugProb: 0 };
    try {
      const { listRecentMigrationEvents, computeMigrationCandidateLagQuantiles, getRugGuardStats } = await import('@trenches/persistence');
      latestMigrations = listRecentMigrationEvents(20).map((m) => ({ ts: m.ts, mint: m.mint, pool: m.pool, source: m.source }));
      lag = computeMigrationCandidateLagQuantiles();
      rug = getRugGuardStats();
      lagP50.set({ quantile: '0.5' }, lag.p50);
      lagP50.set({ quantile: '0.95' }, lag.p95);
      // Observe into histogram (representative)
      lagHist.observe(lag.p50);
      lagHist.observe(lag.p95);
    } catch {}

    // Execution summary (from SQLite exec_outcomes)
    let execution = { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
    let riskBudget = { dailyLossCapUsd: 0, usedUsd: 0, remainingUsd: 0 };
    let sizingDist: Array<{ arm: string; share: number }> = [];
    let survival = { avgHazard: 0, forcedFlattens: 0 };
    let backtest = { lastRunId: 0, lastOverallNetPnl: 0, landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
    let shadow = { feeDisagreePct: 0, sizingDisagreePct: 0 };
    let pnlSummary = { netUsd: 0, grossUsd: 0, feeUsd: 0, slipUsd: 0 };
    let routes: Array<{ route: string; penalty: number }> = [];
    let leaders: Array<{ pool: string; hits: number }> = [];
    let providersBlock: any = undefined;
    try {
      const { getExecSummary, getRiskBudget, getSizingDistribution } = await import('@trenches/persistence');
      execution = getExecSummary();
      riskBudget = getRiskBudget();
      sizingDist = getSizingDistribution();
    } catch {}
    // Provider health (social-ingestor + onchain birdeye key)
    try {
      const si = await fetch(`http://127.0.0.1:${config.services.socialIngestor.port}/healthz`);
      const siJson = (await si.json()) as { sources?: Array<{ name: string; status: any }> };
      const od = await fetch(`http://127.0.0.1:${config.services.onchainDiscovery.port}/healthz`);
      const odJson = (await od.json()) as { birdeyeApiKey?: boolean };
      const mapped: Record<string, any> = {};
      for (const entry of siJson.sources ?? []) {
        mapped[entry.name] = entry.status ?? {};
      }
      mapped.birdeye = { apiKey: Boolean((odJson as any).birdeyeApiKey) };
      providersBlock = mapped;
    } catch {}
    try {
      // Avg hazard from last 100 hazard states
      const db = getDb();
      const rows = db.prepare('SELECT hazard FROM hazard_states ORDER BY ts DESC LIMIT 100').all() as Array<{ hazard: number }>;
      const avg = rows.length ? rows.reduce((a, r) => a + (r.hazard ?? 0), 0) / rows.length : 0;
      survival.avgHazard = avg;
      // Backtest: last run summary
      const last = db.prepare('SELECT id FROM backtest_runs ORDER BY id DESC LIMIT 1').get() as { id?: number } | undefined;
      if (last?.id) {
        backtest.lastRunId = last.id;
        const rs = db.prepare('SELECT metric, value FROM backtest_results WHERE run_id = ?').all(last.id) as Array<{ metric: string; value: number }>;
        for (const r of rs) {
          if (r.metric === 'landed_rate') backtest.landedRate = r.value;
          if (r.metric === 'avg_slip_bps') backtest.avgSlipBps = r.value;
          if (r.metric === 'p50_ttl_ms') backtest.p50Ttl = r.value;
          if (r.metric === 'p95_ttl_ms') backtest.p95Ttl = r.value;
          if (r.metric === 'net_pnl_usd') backtest.lastOverallNetPnl = r.value;
        }
      }
      // Shadow disagreement (last 200)
      const feeRows = db.prepare('SELECT ctx_json FROM shadow_decisions_fee ORDER BY ts DESC LIMIT 200').all() as Array<{ ctx_json: string }>;
      const sizRows = db.prepare('SELECT ctx_json FROM shadow_decisions_sizing ORDER BY ts DESC LIMIT 200').all() as Array<{ ctx_json: string }>;
      const feePairs = feeRows.map((r) => { try { const j = JSON.parse(r.ctx_json); return [j.baselineArm, j.chosenArm]; } catch { return null } }).filter(Boolean) as Array<[number, number]>;
      const sizPairs = sizRows.map((r) => { try { const j = JSON.parse(r.ctx_json); return [j.baselineArm, j.chosenArm]; } catch { return null } }).filter(Boolean) as Array<[string, string]>;
      shadow.feeDisagreePct = feePairs.length ? feePairs.filter(([b,c]) => b !== c).length / feePairs.length : 0;
      shadow.sizingDisagreePct = sizPairs.length ? sizPairs.filter(([b,c]) => b !== c).length / sizPairs.length : 0;
    } catch {}
    try {
      pnlSummary = getPnLSummary();
    } catch {}

    const snapshot: Snapshot & { controlsEnabled: boolean; latestMigrations?: any; migrationLag?: any; rugGuard?: any; execution?: any; riskBudget?: any; sizing?: any; survival?: any; backtest?: any; shadow?: any; routes?: any; leaders?: any; leader?: any; providers?: any } = {
      status,
      controlsEnabled,
      pnl: { day: pnlDay, week: pnlWeek, month: pnlMonth, prices },
      topics,
      candidates,
      positions,
      risk: { exposurePct: 0, dailyLossPct: 0 },
      sizing: { equity: 0, free: 0, tier: 'n/a', base: 0, final: 0, topArms: sizingDist, skips: 0 },
      latestMigrations,
      migrationLag: lag,
      rugGuard: rug,
      execution,
      riskBudget,
      survival,
      backtest,
      shadow,
      providers: providersBlock,
      pnlSummary,
      routes,
      leaders
    };
    return snapshot;
  });

  if (controlsEnabled) {
    const killSwitchToken = config.security.killSwitchToken as string;

    app.post('/kill', async (request, reply) => {
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : (request.body as { token?: string } | undefined)?.token;
      if (token !== killSwitchToken) {
        reply.code(403).send({ status: 'forbidden' });
        return;
      }
      killSwitchArmed = true;
      logger.warn('kill switch engaged, shutting down agents');
      reply.code(202).send({ status: 'shutting-down' });
      setImmediate(() => shutdown('kill-switch'));
    });

    // Control endpoints (simple token auth via killSwitchToken)
    app.post('/control/pause', async (request, reply) => {
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : (request.body as { token?: string } | undefined)?.token;
      if (token !== killSwitchToken) {
        reply.code(403).send({ status: 'forbidden' });
        return;
      }
      killSwitchArmed = true;
      recordHeartbeat('agent-core', 'PAUSED', 'paused via control API');
      reply.code(202).send({ status: 'paused' });
    });

    app.post('/control/resume', async (request, reply) => {
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : (request.body as { token?: string } | undefined)?.token;
      if (token !== killSwitchToken) {
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
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : body.token;
      if (token !== killSwitchToken) {
        reply.code(403).send({ status: 'forbidden' });
        return;
      }
      modeOverride = next as typeof modeOverride;
      recordHeartbeat('agent-core', 'OK', `mode set to ${modeOverride}`);
      reply.code(202).send({ status: 'ok', mode: modeOverride });
    });

    app.post('/control/flatten', async (request, reply) => {
      const auth = request.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : (request.body as { token?: string } | undefined)?.token;
      if (token !== killSwitchToken) {
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
          headers: { Authorization: `Bearer ${killSwitchToken}` }
        });
        reply.code(res.status).send(await res.json());
      } catch (err) {
        reply.code(502).send({ status: 'error', detail: 'position_manager_unreachable' });
      }
    });
  } else {
    logger.info('control endpoints disabled; kill switch token not configured');
  }

  app.get('/events/agent', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    sseClients.add(reply);
    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\r\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\r\n\r\n`);
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













