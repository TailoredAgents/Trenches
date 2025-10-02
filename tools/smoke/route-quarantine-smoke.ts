#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import { loadConfig } from '@trenches/config';
import { getRegistry } from '@trenches/metrics';
import { computeWindowStart, loadRouteStats, recordRouteAttempt, markRouteExcluded, RouteQuarantineConfig } from '../../services/executor/src/routeQuarantine';

type RouteQualityRow = {
  route: string;
  attempts: number;
  fails: number;
  failRate: number;
  avgSlipRealBps: number;
  penalty: number;
  excluded: boolean;
};

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function parseMetricSum(text: string, metric: string): number {
  return splitLines(text)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith(metric))
    .reduce((sum, line) => {
      const parts = line.split(/\s+/);
      const value = Number(parts[parts.length - 1]);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
}

async function main() {
  const cfg = loadConfig();
  const rqConfig = ((cfg as any).execution?.routeQuarantine ?? {
    windowMinutes: 1440,
    minAttempts: 8,
    failRateThreshold: 0.25,
    slipExcessWeight: 0.5,
    failRateWeight: 100
  }) as RouteQuarantineConfig;
  const dbPath = process.env.SQLITE_DB_PATH ?? (cfg as any).persistence?.sqlitePath ?? './data/trenches.db';

  let db: DatabaseConstructor.Database | null = null;

  try {
    const goodRoute = 'ok-path';
    const badRoute = 'bad-path';
    const now = Date.now();
    const windowStart = computeWindowStart(now, rqConfig.windowMinutes);

    loadRouteStats(rqConfig, windowStart);
    db = new DatabaseConstructor(dbPath);
    db.prepare('DELETE FROM route_stats WHERE route IN (?, ?) AND window_start_ts = ?').run(goodRoute, badRoute, windowStart);

    for (let i = 0; i < 12; i += 1) {
      const success = i !== 0; // leave one failure for good route
      recordRouteAttempt({
        config: rqConfig,
        route: goodRoute,
        windowStartTs: windowStart,
        success,
        slipRealBps: success ? 85 : 95,
        slipExpBps: 80
      });
    }

    for (let i = 0; i < 12; i += 1) {
      const success = i < 7; // five failures out of twelve
      recordRouteAttempt({
        config: rqConfig,
        route: badRoute,
        windowStartTs: windowStart,
        success,
        slipRealBps: success ? 150 : 240,
        slipExpBps: 110
      });
    }

    const statsMap = loadRouteStats(rqConfig, windowStart);
    const rows = Array.from(statsMap.values());
    const good = rows.find((row) => row.route === goodRoute);
    const bad = rows.find((row) => row.route === badRoute);

    if (!bad || !bad.excluded) {
      throw new Error('expected bad route to be excluded');
    }
    if (!good) {
      throw new Error('expected good route stats to exist');
    }

    const ranked = rows.filter((row) => !row.excluded).sort((a, b) => a.penalty - b.penalty);
    if (ranked[0]?.route !== goodRoute) {
      throw new Error(`expected ${goodRoute} to rank first, got ${ranked[0]?.route ?? 'none'}`);
    }

    markRouteExcluded(badRoute);

    const metricsText = await getRegistry().metrics();
    const attemptsSum = parseMetricSum(metricsText, 'executor_route_attempts_total');
    const failsSum = parseMetricSum(metricsText, 'executor_route_fails_total');
    const excludedSum = parseMetricSum(metricsText, 'executor_routes_excluded_total');

    if (attemptsSum < 24) {
      throw new Error('route attempts metric did not record all attempts');
    }
    if (failsSum < 5) {
      throw new Error('route fails metric did not record failures');
    }
    if (excludedSum < 1) {
      throw new Error('route exclusion metric did not increment');
    }

    console.log(`route-quarantine-smoke: excluded=${badRoute}, chosen=${goodRoute}`);
  } finally {
    if (db) {
      db.close();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
