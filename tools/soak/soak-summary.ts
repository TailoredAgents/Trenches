#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import DatabaseConstructor from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import { loadConfig } from '@trenches/config';
import { quantileFloor } from '@trenches/util';

type CLIOptions = {
  dbPath: string;
  fromIso: string;
  toIso: string;
  firstMinuteWindowMs: number;
};

type ExecRow = {
  ts: number;
  filled: number;
  slip: number | null;
  ttl: number | null;
};

type OverallMetrics = {
  attempts: number;
  filled: number;
  landedRate: number;
  avgSlipBps: number;
  p50TtlMs: number;
  p95TtlMs: number;
  slipSamples: number;
  ttlSamples: number;
};

type FirstMinuteMetrics = {
  available: boolean;
  reason?: string;
  windowMs: number;
  attempts: number;
  filled: number;
  landedRate: number;
  avgSlipBps: number | null;
  p50TtlMs: number | null;
  p95TtlMs: number | null;
  slipSamples: number;
  ttlSamples: number;
  ordersEvaluated: number;
  ordersWithEntry: number;
  ordersWithMigration: number;
};

type RouteMetrics = {
  windowStartTs: number | null;
  windowStartIso: string | null;
  minAttempts: number;
  failRateThreshold: number;
  routesWithData: number;
  routesExcluded: number;
  totalAttempts: number;
  attemptWeightedSlipRealBps: number | null;
  attemptWeightedSlipExpBps: number | null;
};

type OrderRow = {
  id: string;
  mint: string;
  route: string | null;
  status: string;
  created_ts: number | null;
  updated_ts: number | null;
};

type ExecSuccessRow = {
  id: number;
  ts: number;
  route: string | null;
  slip: number | null;
  ttl: number | null;
};

type RouteStatRow = {
  route: string;
  attempts: number;
  fails: number;
  real: number | null;
  exp: number | null;
};

type Summary = {
  generatedAt: string;
  dbPath: string;
  range: { from: string; to: string; durationHours: number };
  firstMinuteWindowMs: number;
  overall: OverallMetrics;
  firstMinute: FirstMinuteMetrics;
  routeQuarantine: RouteMetrics;
  reportCsvPath: string;
};

const HELP_MESSAGE = `Usage: tsx tools/soak/soak-summary.ts [options]
  --db <path>                 Path to SQLite db (default: $PERSISTENCE_SQLITE_PATH or ./data/agent.db)
  --from <ISO>                ISO timestamp inclusive lower bound (default: now - 24h)
  --to <ISO>                  ISO timestamp inclusive upper bound (default: now)
  --firstMinuteWindowMs <ms>  First-minute window in milliseconds (default: 60000)
  --help                      Show this help message
`;

function parseArgs(): CLIOptions {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP_MESSAGE.trim());
    process.exit(0);
  }
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const eqIdx = token.indexOf('=');
    let key: string;
    let value: string | undefined;
    if (eqIdx !== -1) {
      key = token.slice(2, eqIdx);
      value = token.slice(eqIdx + 1);
    } else {
      key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        if (key === 'db') {
          continue;
        }
        throw new Error(`Missing value for --${key}`);
      }
      value = next;
      i += 1;
    }
    if (value === undefined) {
      continue;
    }
    options[key] = value;
  }
  const envDb = process.env.PERSISTENCE_SQLITE_PATH;
  const dbCandidate = options.db?.trim();
  const dbPath = dbCandidate && dbCandidate.length > 0
    ? dbCandidate
    : envDb && envDb.trim().length > 0
      ? envDb.trim()
      : './data/agent.db';
  const fromIso = options.from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const toIso = options.to ?? new Date().toISOString();
  const firstMinuteWindowMs = options.firstMinuteWindowMs ? Number(options.firstMinuteWindowMs) : 60_000;
  if (!Number.isFinite(firstMinuteWindowMs) || firstMinuteWindowMs <= 0) {
    throw new Error('firstMinuteWindowMs must be a positive number');
  }
  return { dbPath, fromIso, toIso, firstMinuteWindowMs };
}

function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const maxIndex = values.length - 1;
  const index = maxIndex * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return quantileFloor(values, p);
  }
  const weight = index - lower;
  const lowerValue = quantileFloor(values, lower / maxIndex);
  const upperValue = quantileFloor(values, upper / maxIndex);
  return lowerValue * (1 - weight) + upperValue * weight;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function sanitizeForFilename(input: string): string {
  return input.replace(/[:]/g, '').replace(/\./g, '').replace(/[^0-9A-Za-zTZ_-]/g, '_');
}

function getExistingTables(db: BetterSqlite3Database): Set<string> {
  try {
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  } catch {
    return new Set<string>();
  }
}

function computeOverall(db: BetterSqlite3Database, tables: Set<string>, fromMs: number, toMs: number): OverallMetrics {
  if (!tables.has('exec_outcomes')) {
    return { attempts: 0, filled: 0, landedRate: 0, avgSlipBps: 0, p50TtlMs: 0, p95TtlMs: 0, slipSamples: 0, ttlSamples: 0 };
  }
  const rows = db
    .prepare(`SELECT ts, filled, slippage_bps_real AS slip, time_to_land_ms AS ttl FROM exec_outcomes WHERE ts BETWEEN ? AND ?`)
    .all(fromMs, toMs) as ExecRow[];
  const attempts = rows.length;
  let filled = 0;
  const slipValues: number[] = [];
  const ttlValues: number[] = [];
  for (const row of rows) {
    if (row.filled) {
      filled += 1;
      if (Number.isFinite(row.slip ?? NaN)) {
        slipValues.push(row.slip as number);
      }
      if (Number.isFinite(row.ttl ?? NaN)) {
        ttlValues.push(row.ttl as number);
      }
    }
  }
  return {
    attempts,
    filled,
    landedRate: attempts > 0 ? filled / attempts : 0,
    avgSlipBps: slipValues.length ? mean(slipValues) : 0,
    p50TtlMs: ttlValues.length ? quantile(ttlValues, 0.5) : 0,
    p95TtlMs: ttlValues.length ? quantile(ttlValues, 0.95) : 0,
    slipSamples: slipValues.length,
    ttlSamples: ttlValues.length
  };
}

function computeFirstMinute(
  db: BetterSqlite3Database,
  tables: Set<string>,
  fromMs: number,
  toMs: number,
  windowMs: number
): FirstMinuteMetrics {
  if (!tables.has('orders') || !tables.has('migration_events')) {
    return {
      available: false,
      reason: !tables.has('orders') ? 'ordersTableMissing' : 'migrationEventsTableMissing',
      windowMs,
      attempts: 0,
      filled: 0,
      landedRate: 0,
      avgSlipBps: null,
      p50TtlMs: null,
      p95TtlMs: null,
      slipSamples: 0,
      ttlSamples: 0,
      ordersEvaluated: 0,
      ordersWithEntry: 0,
      ordersWithMigration: 0
    };
  }
  const orderRows = db
    .prepare(`SELECT id, mint, route, status,
                    CAST(strftime('%s', created_at) AS INTEGER) * 1000 AS created_ts,
                    CAST(strftime('%s', updated_at) AS INTEGER) * 1000 AS updated_ts
              FROM orders
              WHERE status != 'PENDING'
                AND created_at IS NOT NULL
                AND CAST(strftime('%s', created_at) AS INTEGER) * 1000 BETWEEN ? AND ?`)
    .all(fromMs, toMs) as OrderRow[];
  const ordersEvaluated = orderRows.length;
  const margin = Math.max(windowMs * 2, 5 * 60_000);
  const execRows = tables.has('exec_outcomes')
    ? (db
        .prepare(`SELECT rowid AS id, ts, route, slippage_bps_real AS slip, time_to_land_ms AS ttl
                  FROM exec_outcomes
                  WHERE filled = 1 AND ts BETWEEN ? AND ?`)
        .all(Math.max(0, fromMs - margin), toMs + margin) as ExecSuccessRow[])
    : [];
  const execByRoute = new Map<string, ExecSuccessRow[]>();
  execRows.forEach((row) => {
    const routeKey = row.route ?? 'unknown';
    const list = execByRoute.get(routeKey);
    if (list) {
      list.push(row);
    } else {
      execByRoute.set(routeKey, [row]);
    }
  });
  for (const [, list] of execByRoute) {
    list.sort((a, b) => a.ts - b.ts);
  }
  const migrationStmt = db.prepare(`SELECT ts FROM migration_events WHERE mint = ? ORDER BY ts ASC`);
  const migrationCache = new Map<string, number[]>();
  const getTimeline = (mint: string): number[] => {
    if (migrationCache.has(mint)) {
      return migrationCache.get(mint)!;
    }
    const rows = migrationStmt.all(mint) as Array<{ ts: number }>;
    const timeline = rows.map((r) => Number(r.ts)).filter((ts) => Number.isFinite(ts)).sort((a, b) => a - b);
    migrationCache.set(mint, timeline);
    return timeline;
  };
  const findLatestMigration = (timeline: number[], ts: number): number | undefined => {
    if (timeline.length === 0) {
      return undefined;
    }
    let left = 0;
    let right = timeline.length - 1;
    let latest: number | undefined;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const value = timeline[mid];
      if (value <= ts) {
        latest = value;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return latest;
  };
  let ordersWithEntry = 0;
  let ordersWithMigration = 0;
  const firstMinuteOrders: Array<{ order: OrderRow; entryTs: number; migrationTs: number }> = [];
  for (const order of orderRows) {
    const entryTs = numberOrUndefined(order.created_ts) ?? numberOrUndefined(order.updated_ts);
    if (entryTs === undefined) {
      continue;
    }
    if (entryTs < fromMs || entryTs > toMs) {
      continue;
    }
    ordersWithEntry += 1;
    const timeline = getTimeline(order.mint);
    if (timeline.length === 0) {
      continue;
    }
    const migrationTs = findLatestMigration(timeline, entryTs);
    if (migrationTs === undefined) {
      continue;
    }
    ordersWithMigration += 1;
    const delta = entryTs - migrationTs;
    if (delta >= 0 && delta <= windowMs) {
      firstMinuteOrders.push({ order, entryTs, migrationTs });
    }
  }
  const attempts = firstMinuteOrders.length;
  let filled = 0;
  const slipValues: number[] = [];
  const ttlValues: number[] = [];
  const usedExecIds = new Set<number>();
  const matchTolerance = Math.max(windowMs, 60_000);
  for (const item of firstMinuteOrders) {
    const status = item.order.status?.toUpperCase?.() ?? item.order.status;
    if (status === 'FILLED') {
      filled += 1;
      const routeKey = item.order.route ?? 'unknown';
      const candidates = execByRoute.get(routeKey);
      if (!candidates || candidates.length === 0) {
        continue;
      }
      let best: ExecSuccessRow | undefined;
      let bestDelta = Infinity;
      for (const candidate of candidates) {
        if (usedExecIds.has(candidate.id)) {
          continue;
        }
        const delta = Math.abs(candidate.ts - item.entryTs);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = candidate;
        }
      }
      if (best && bestDelta <= matchTolerance) {
        usedExecIds.add(best.id);
        if (Number.isFinite(best.slip ?? NaN)) {
          slipValues.push(best.slip as number);
        }
        if (Number.isFinite(best.ttl ?? NaN)) {
          ttlValues.push(best.ttl as number);
        }
      }
    }
  }
  let available = true;
  let reason: string | undefined;
  if (ordersEvaluated === 0) {
    available = true;
    reason = 'noOrdersInWindow';
  } else if (ordersWithEntry === 0) {
    available = false;
    reason = 'missingEntryTimestamps';
  } else if (ordersWithMigration === 0) {
    available = false;
    reason = 'missingMigrationEvents';
  } else if (attempts === 0) {
    reason = 'noFirstMinuteTrades';
  }
  return {
    available,
    reason,
    windowMs,
    attempts,
    filled,
    landedRate: attempts > 0 ? filled / attempts : 0,
    avgSlipBps: slipValues.length ? mean(slipValues) : null,
    p50TtlMs: ttlValues.length ? quantile(ttlValues, 0.5) : null,
    p95TtlMs: ttlValues.length ? quantile(ttlValues, 0.95) : null,
    slipSamples: slipValues.length,
    ttlSamples: ttlValues.length,
    ordersEvaluated,
    ordersWithEntry,
    ordersWithMigration
  };
}

function computeRouteMetrics(
  db: BetterSqlite3Database,
  tables: Set<string>,
  minAttempts: number,
  failRateThreshold: number
): RouteMetrics {
  if (!tables.has('route_stats')) {
    return {
      windowStartTs: null,
      windowStartIso: null,
      minAttempts,
      failRateThreshold,
      routesWithData: 0,
      routesExcluded: 0,
      totalAttempts: 0,
      attemptWeightedSlipRealBps: null,
      attemptWeightedSlipExpBps: null
    };
  }
  const windowRow = db.prepare(`SELECT MAX(window_start_ts) AS maxTs FROM route_stats`).get() as { maxTs: number | null } | undefined;
  const windowStartTs = windowRow?.maxTs ?? null;
  if (!windowStartTs) {
    return {
      windowStartTs: null,
      windowStartIso: null,
      minAttempts,
      failRateThreshold,
      routesWithData: 0,
      routesExcluded: 0,
      totalAttempts: 0,
      attemptWeightedSlipRealBps: null,
      attemptWeightedSlipExpBps: null
    };
  }
  const stats = db
    .prepare(`SELECT route, attempts, fails, avg_slip_real_bps AS real, avg_slip_exp_bps AS exp FROM route_stats WHERE window_start_ts = ?`)
    .all(windowStartTs) as RouteStatRow[];
  let routesExcluded = 0;
  let totalAttempts = 0;
  let weightedReal = 0;
  let weightedExp = 0;
  for (const row of stats) {
    const attempts = Number(row.attempts ?? 0);
    const fails = Number(row.fails ?? 0);
    totalAttempts += attempts;
    if (Number.isFinite(row.real ?? NaN)) {
      weightedReal += (row.real as number) * attempts;
    }
    if (Number.isFinite(row.exp ?? NaN)) {
      weightedExp += (row.exp as number) * attempts;
    }
    const failRate = attempts > 0 ? fails / attempts : 0;
    if (attempts >= minAttempts && failRate > failRateThreshold) {
      routesExcluded += 1;
    }
  }
  const attemptWeightedSlipRealBps = totalAttempts > 0 ? weightedReal / totalAttempts : null;
  const attemptWeightedSlipExpBps = totalAttempts > 0 ? weightedExp / totalAttempts : null;
  return {
    windowStartTs,
    windowStartIso: new Date(windowStartTs).toISOString(),
    minAttempts,
    failRateThreshold,
    routesWithData: stats.length,
    routesExcluded,
    totalAttempts,
    attemptWeightedSlipRealBps,
    attemptWeightedSlipExpBps
  };
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(4);
}

function formatSlip(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '';
  return Math.round(value).toString();
}

function csvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return '';
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function writeCsv(summary: Summary, absolutePath: string): void {
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const header =
    'segment,attempts,filled,landedRate,avgSlipBps,p50TtlMs,p95TtlMs,routesExcluded,totalRoutes,routeAvgSlipRealBps,routeAvgSlipExpBps,routeWindowStartTs,notes';
  const rows = [
    {
      segment: 'overall',
      attempts: summary.overall.attempts,
      filled: summary.overall.filled,
      landedRate: formatRate(summary.overall.landedRate),
      avgSlipBps: formatSlip(summary.overall.avgSlipBps),
      p50TtlMs: formatMs(summary.overall.p50TtlMs),
      p95TtlMs: formatMs(summary.overall.p95TtlMs),
      routesExcluded: '',
      totalRoutes: '',
      routeAvgSlipRealBps: '',
      routeAvgSlipExpBps: '',
      routeWindowStartTs: summary.routeQuarantine.windowStartIso ?? '',
      notes: ''
    },
    {
      segment: 'firstMinute',
      attempts: summary.firstMinute.attempts,
      filled: summary.firstMinute.filled,
      landedRate: formatRate(summary.firstMinute.landedRate),
      avgSlipBps: formatSlip(summary.firstMinute.avgSlipBps),
      p50TtlMs: formatMs(summary.firstMinute.p50TtlMs),
      p95TtlMs: formatMs(summary.firstMinute.p95TtlMs),
      routesExcluded: '',
      totalRoutes: '',
      routeAvgSlipRealBps: '',
      routeAvgSlipExpBps: '',
      routeWindowStartTs: '',
      notes: `available=${summary.firstMinute.available}` + (summary.firstMinute.reason ? ` reason=${summary.firstMinute.reason}` : '')
    },
    {
      segment: 'routeQuarantine',
      attempts: summary.routeQuarantine.totalAttempts,
      filled: '',
      landedRate: '',
      avgSlipBps: '',
      p50TtlMs: '',
      p95TtlMs: '',
      routesExcluded: summary.routeQuarantine.routesExcluded,
      totalRoutes: summary.routeQuarantine.routesWithData,
      routeAvgSlipRealBps: formatSlip(summary.routeQuarantine.attemptWeightedSlipRealBps),
      routeAvgSlipExpBps: formatSlip(summary.routeQuarantine.attemptWeightedSlipExpBps),
      routeWindowStartTs: summary.routeQuarantine.windowStartIso ?? '',
      notes: `minAttempts=${summary.routeQuarantine.minAttempts};failRateThreshold=${summary.routeQuarantine.failRateThreshold}`
    }
  ];
  const lines = [
    header,
    ...rows.map((row) =>
      [
        row.segment,
        row.attempts,
        row.filled,
        row.landedRate,
        row.avgSlipBps,
        row.p50TtlMs,
        row.p95TtlMs,
        row.routesExcluded,
        row.totalRoutes,
        row.routeAvgSlipRealBps,
        row.routeAvgSlipExpBps,
        row.routeWindowStartTs,
        row.notes
      ]
        .map(csvValue)
        .join(',')
    )
  ];
  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  const cli = parseArgs();
  const fromMs = Date.parse(cli.fromIso);
  const toMs = Date.parse(cli.toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error('Invalid ISO timestamps for --from/--to');
  }
  if (fromMs > toMs) {
    throw new Error('--from must be earlier than or equal to --to');
  }
  if (!fs.existsSync(cli.dbPath)) {
    throw new Error(`SQLite database not found at ${cli.dbPath}`);
  }
  const db = new DatabaseConstructor(cli.dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = getExistingTables(db);
    const overall = computeOverall(db, tables, fromMs, toMs);
    const firstMinute = computeFirstMinute(db, tables, fromMs, toMs, cli.firstMinuteWindowMs);
    const config = loadConfig({ forceReload: true });
    const routeConfig = config.execution.routeQuarantine;
    const routeQuarantine = computeRouteMetrics(db, tables, routeConfig.minAttempts, routeConfig.failRateThreshold);
    const rangeFromIso = new Date(fromMs).toISOString();
    const rangeToIso = new Date(toMs).toISOString();
    const durationHours = Number(((toMs - fromMs) / 3_600_000).toFixed(4));
    const reportFileName = `soak_summary_${sanitizeForFilename(rangeFromIso)}_${sanitizeForFilename(rangeToIso)}.csv`;
    const reportAbsolutePath = path.resolve(process.cwd(), 'reports', reportFileName);
    const summary: Summary = {
      generatedAt: new Date().toISOString(),
      dbPath: path.resolve(cli.dbPath),
      range: { from: rangeFromIso, to: rangeToIso, durationHours },
      firstMinuteWindowMs: cli.firstMinuteWindowMs,
      overall,
      firstMinute,
      routeQuarantine,
      reportCsvPath: path.relative(process.cwd(), reportAbsolutePath)
    };
    console.log(`[soak-summary] window: ${rangeFromIso} -> ${rangeToIso}`);
    writeCsv(summary, reportAbsolutePath);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? `Error: ${err.message}` : String(err));
    process.exit(1);
  });
}



