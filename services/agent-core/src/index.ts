import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { startMetricsServer, registerGauge, getRegistry } from '@trenches/metrics';
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
    getPnLSummary,
    getLunarSummary,
    countSimOutcomes,
    lastSimOutcomeTs
  } from '@trenches/persistence';
import type { LunarScoreSummary } from '@trenches/persistence';
import { Snapshot } from '@trenches/shared';
import { resolveServiceUrl } from '@trenches/util';

const logger = createLogger('agent-core');

const PROVIDER_STATUS_TTL_MS = 20_000;
type ProviderHealthCacheEntry<T> = { data: T | null; fetchedAt: number; error?: string };
const providerHealthCache = new Map<string, ProviderHealthCacheEntry<any>>();

type ProviderEntry = {
  state?: string;
  status?: string;
  detail?: string;
  message?: string;
  lastSuccessTs?: number | null;
  lastSuccessAt?: string | null;
  lastEventTs?: number | null;
  lastPollTs?: number | null;
  apiKey?: boolean;
  stale?: boolean;
  error?: string;
  lastFetchedTs?: number | null;
};

type LunarSummaryBlock = LunarScoreSummary & { status: 'disabled' | 'ok' | 'stale' | 'no_data' | 'error'; message?: string };

type MetricsSummary = {
  execution: { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number };
  providers: Record<string, ProviderEntry>;
  discovery: {
    providerCache: {
      hits: number;
      misses: number;
      byProvider?: Record<string, { hits: number; misses: number }>;
    };
  };
  price: { solUsdAgeSec: number; ok: boolean };
  lunarcrush?: LunarSummaryBlock;
};

const SUMMARY_FETCH_TIMEOUT_MS = 800;

function coerceTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value > 1_000_000_000_000 ? value : Math.floor(value * 1000);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

async function fetchJsonWithTimeout<T = any>(url: string, timeoutMs = SUMMARY_FETCH_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error({ err, url }, 'fetchJsonWithTimeout failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchProviderHealth<T>(key: string, fetcher: () => Promise<T | null>): Promise<{ data: T | null; stale: boolean; error?: string; fetchedAt: number }> {
  const now = Date.now();
  const cached = providerHealthCache.get(key) as ProviderHealthCacheEntry<T> | undefined;
  if (cached && now - cached.fetchedAt <= PROVIDER_STATUS_TTL_MS) {
    return { data: cached.data, stale: Boolean(cached.error), error: cached.error, fetchedAt: cached.fetchedAt };
  }
  try {
    const data = await fetcher();
    if (data === null) {
      const error = 'empty provider health response';
      const entry: ProviderHealthCacheEntry<T> = { data: cached?.data ?? null, fetchedAt: now, error };
      providerHealthCache.set(key, entry);
      return { data: entry.data, stale: true, error, fetchedAt: entry.fetchedAt };
    }
    const entry: ProviderHealthCacheEntry<T> = { data, fetchedAt: now };
    providerHealthCache.set(key, entry);
    return { data, stale: false, fetchedAt: entry.fetchedAt };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, service: key }, 'failed to fetch provider health');
    const entry: ProviderHealthCacheEntry<T> = { data: cached?.data ?? null, fetchedAt: now, error: errorMessage };
    providerHealthCache.set(key, entry);
    return { data: entry.data, stale: true, error: errorMessage, fetchedAt: entry.fetchedAt };
  }
}

function computePriceStatus(db: any, config: any): { solUsdAgeSec: number; ok: boolean } {
  let result = { solUsdAgeSec: 0, ok: false };
  try {
    const row = db
      .prepare('SELECT ts FROM prices WHERE symbol = ? ORDER BY ts DESC LIMIT 1')
      .get('SOL') as { ts?: number } | undefined;
    if (row?.ts) {
      const ageSec = Math.max(0, Math.floor((Date.now() - row.ts) / 1000));
      const warn = (config?.priceUpdater?.staleWarnSec ?? 300) as number;
      result = { solUsdAgeSec: ageSec, ok: ageSec <= warn };
    }
  } catch (err) {
    logger.error({ err }, 'failed to compute price status');
  }
  return result;
}

async function collectProviderStatuses(config: any): Promise<Record<string, ProviderEntry>> {
  const out: Record<string, ProviderEntry> = {};
  const servicesRecord = config.services as Partial<Record<string, { port?: number }>>;
  const endpointsRecord = config.endpoints as Partial<Record<string, { baseUrl?: string }>> | undefined;
  const socialHealthUrl = resolveServiceUrl(servicesRecord, endpointsRecord, 'socialIngestor', '/healthz');
  const discoveryHealthUrl = resolveServiceUrl(servicesRecord, endpointsRecord, 'onchainDiscovery', '/healthz');

  const socialResult = await fetchProviderHealth(
    'social-ingestor',
    () =>
      fetchJsonWithTimeout<{
        sources?: Array<{ name: string; status?: { state?: string; detail?: string; lastSuccessAt?: string; lastEventTs?: number } }>
      }>(socialHealthUrl)
  );
  const socialHealth = socialResult.data;
  if (socialHealth?.sources) {
    for (const entry of socialHealth.sources) {
      const status = entry.status ?? {};
      const lastSuccessTs = coerceTimestamp(status.lastSuccessAt);
      const lastEventTs = coerceTimestamp(status.lastEventTs);
      out[entry.name] = {
        state: status.state,
        detail: status.detail,
        lastSuccessTs,
        lastSuccessAt: status.lastSuccessAt ?? null,
        lastEventTs,
        stale: socialResult.stale,
        error: socialResult.error,
        lastFetchedTs: socialResult.fetchedAt
      };
    }
  } else if (socialResult.error) {
    out['social-ingestor'] = {
      state: 'degraded',
      detail: socialResult.error,
      message: socialResult.error,
      stale: true,
      error: socialResult.error,
      lastFetchedTs: socialResult.fetchedAt
    };
  }

  const discoveryResult = await fetchProviderHealth(
    'onchain-discovery',
    () =>
      fetchJsonWithTimeout<{
        providers?: { solanatracker?: { status?: string; lastPollTs?: number; message?: string } };
        birdeyeApiKey?: boolean;
      }>(discoveryHealthUrl)
  );

  const discoveryHealth = discoveryResult.data;
  const sol = discoveryHealth?.providers?.solanatracker;
  if (sol) {
    const lastPollTs = coerceTimestamp(sol.lastPollTs);
    out.solanatracker = {
      state: sol.status,
      status: sol.status,
      detail: sol.message,
      message: sol.message,
      lastSuccessTs: lastPollTs,
      lastPollTs,
      stale: discoveryResult.stale,
      error: discoveryResult.error,
      lastFetchedTs: discoveryResult.fetchedAt
    };
  } else if (discoveryResult.error && !out.solanatracker) {
    out.solanatracker = {
      state: 'degraded',
      detail: discoveryResult.error,
      message: discoveryResult.error,
      stale: true,
      error: discoveryResult.error,
      lastFetchedTs: discoveryResult.fetchedAt
    };
  }
  if (typeof discoveryHealth?.birdeyeApiKey === 'boolean') {
    out.birdeye = {
      state: discoveryHealth.birdeyeApiKey ? 'configured' : 'missing_key',
      apiKey: discoveryHealth.birdeyeApiKey,
      stale: discoveryResult.stale,
      error: discoveryResult.error,
      lastFetchedTs: discoveryResult.fetchedAt
    };
  } else if (discoveryResult.error) {
    out.birdeye = {
      state: 'degraded',
      detail: discoveryResult.error,
      message: discoveryResult.error,
      stale: true,
      error: discoveryResult.error,
      lastFetchedTs: discoveryResult.fetchedAt
    };
  }

  return out;
}

function collectMetricTotals(registry: ReturnType<typeof getRegistry>, metricName: string): { total: number; byProvider: Record<string, number> } {
  const metric = registry.getSingleMetric(metricName) as { get: () => { values?: Array<{ value: number; labels?: Record<string, string> }> } } | undefined;
  const totals: { total: number; byProvider: Record<string, number> } = { total: 0, byProvider: {} };
  if (!metric) {
    return totals;
  }
  try {
    const data = metric.get();
    for (const sample of data.values ?? []) {
      const value = Number(sample.value ?? 0);
      if (!Number.isFinite(value)) continue;
      totals.total += value;
      const provider = sample.labels?.provider;
      if (provider) {
        totals.byProvider[provider] = (totals.byProvider[provider] ?? 0) + value;
      }
    }
  } catch (err) {
    logger.error({ err, metricName }, 'failed to collect metric totals');
  }
  return totals;
}

function summarizeProviderCache(): {
  providerCache: { hits: number; misses: number; byProvider?: Record<string, { hits: number; misses: number }> };
} {
  const registry = getRegistry();
  const hits = collectMetricTotals(registry, 'provider_cache_hits_total');
  const misses = collectMetricTotals(registry, 'provider_cache_misses_total');
  const providers = new Set([...Object.keys(hits.byProvider), ...Object.keys(misses.byProvider)]);
  const byProvider: Record<string, { hits: number; misses: number }> = {};
  for (const provider of providers) {
    byProvider[provider] = {
      hits: hits.byProvider[provider] ?? 0,
      misses: misses.byProvider[provider] ?? 0
    };
  }
  return {
    providerCache: {
      hits: hits.total,
      misses: misses.total,
      byProvider: Object.keys(byProvider).length > 0 ? byProvider : undefined
    }
  };
}

async function buildMetricsSummary(config: any, db: any): Promise<MetricsSummary> {
  let execution: MetricsSummary['execution'] = { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
  try {
    const { getExecSummary } = await import('@trenches/persistence');
    execution = getExecSummary();
  } catch (err) {
    logger.error({ err }, 'failed to load execution summary');
  }

  const providers = await collectProviderStatuses(config);
  const discovery = summarizeProviderCache();
  const price = computePriceStatus(db, config);

  const pollSec = Number(config.lunarcrush?.pollSec ?? 180);
  const windowMinutes = Number.isFinite(pollSec) && pollSec > 0 ? Math.max(15, Math.round((pollSec / 60) * 12)) : 60;
  const emptyLunar: LunarScoreSummary = {
    windowMinutes,
    sampleCount: 0,
    matchedCount: 0,
    matchRate: 0,
    avgBoost: 0,
    maxBoost: 0,
    avgGalaxy: 0,
    avgDominance: 0,
    avgInteractions: 0,
    avgAltRank: 0,
    avgRecency: 0,
    lastScoreTs: null,
    lastMatchedTs: null
  };
  const lunarEnabled = config.lunarcrush?.enabled !== false;
  let lunar: LunarSummaryBlock;

  if (!lunarEnabled) {
    lunar = { ...emptyLunar, status: 'disabled', message: 'disabled_via_config' };
  } else {
    try {
      const base = getLunarSummary(windowMinutes);
      let status: LunarSummaryBlock['status'] = 'ok';
      let message: string | undefined;
      if (base.sampleCount === 0) {
        status = 'no_data';
        message = 'no_scores';
      } else if (!base.lastMatchedTs) {
        status = 'no_data';
        message = 'no_matches';
      } else {
        const now = Date.now();
        const staleThresholdMs = Math.max(10 * 60 * 1000, (Number.isFinite(pollSec) && pollSec > 0 ? pollSec : 180) * 1000 * 5);
        if (now - base.lastMatchedTs > staleThresholdMs) {
          status = 'stale';
          const staleSeconds = Math.round((now - base.lastMatchedTs) / 1000);
          message = 'stale_' + staleSeconds.toString() + 's';
        }
      }
      lunar = { ...base, status, message };
    } catch (err) {
      lunar = { ...emptyLunar, status: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  providers.lunarcrush = {
    state: lunar.status,
    status: lunar.status,
    detail: lunar.message,
    message: lunar.message,
    lastSuccessTs: lunar.lastMatchedTs,
    lastEventTs: lunar.lastScoreTs,
    stale: lunar.status !== 'ok' && lunar.status !== 'disabled'
  };

  return {
    execution,
    providers,
    discovery,
    price,
    lunarcrush: lunar
  };
}

async function bootstrap() {
  const config = loadConfig();
  const servicesRecord = config.services as Partial<Record<string, { port?: number }>>;
  const endpointsRecord = config.endpoints as Partial<Record<string, { baseUrl?: string }>> | undefined;
  const policyHealthUrl = resolveServiceUrl(servicesRecord, endpointsRecord, 'policyEngine', '/healthz');
  const positionFlattenUrl = resolveServiceUrl(servicesRecord, endpointsRecord, 'positionManager', '/control/flatten');
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
    const prices = computePriceStatus(db, config);


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
    } catch (err) {
      logger.error({ err }, 'failed to load migration metrics');
    }

    // Execution summary (from SQLite exec_outcomes)
    let execution = { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
    let riskBudget = { dailyLossCapUsd: 0, usedUsd: 0, remainingUsd: 0 };
    let sizingDist: Array<{ arm: string; share: number }> = [];
    const survival = { avgHazard: 0, forcedFlattens: 0 };
    const backtest = { lastRunId: 0, lastOverallNetPnl: 0, landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
    const shadow: any = { feeDisagreePct: 0, sizingDisagreePct: 0 };
    let pnlSummary = { netUsd: 0, grossUsd: 0, feeUsd: 0, slipUsd: 0 };
    const routes: Array<{ route: string; penalty: number }> = [];
    const leaders: Array<{ pool: string; hits: number }> = [];
    let providersBlock: any = undefined;
    try {
      const { getExecSummary, getRiskBudget, getSizingDistribution } = await import('@trenches/persistence');
      execution = getExecSummary();
      riskBudget = getRiskBudget();
      sizingDist = getSizingDistribution();
    } catch (err) {
      logger.error({ err }, 'failed to load execution metrics');
    }
    // Provider health (social-ingestor + onchain birdeye key)
    const providerSummary = await collectProviderStatuses(config);
    providersBlock = Object.keys(providerSummary).length > 0 ? providerSummary : undefined;
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
    } catch (err) {
      logger.error({ err }, 'failed to aggregate snapshot metrics');
    }
    try {
      const simRows = countSimOutcomes(24 * 3600);
      const lastSimTs = lastSimOutcomeTs();
      shadow.simRows24h = simRows;
      shadow.lastTs = lastSimTs;
    } catch (err) {
      // analytics-only
    }
    try {
      pnlSummary = getPnLSummary();
    } catch (err) {
      logger.error({ err }, 'failed to load pnl summary');
    }

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

  app.get('/metrics/summary', async () => {
    return buildMetricsSummary(config, db);
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
        const pe = await fetch(policyHealthUrl);
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
        const res = await fetch(positionFlattenUrl, {
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
});









