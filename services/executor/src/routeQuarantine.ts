import { upsertRouteStat, getRouteStats } from '@trenches/persistence';
import { routeAttemptsTotal, routeFailsTotal, routePenaltyGauge, routesExcludedTotal } from './metrics';

export type RouteQuarantineConfig = {
  windowMinutes: number;
  minAttempts: number;
  failRateThreshold: number;
  slipExcessWeight: number;
  failRateWeight: number;
};

export type RouteStatSnapshot = {
  route: string;
  attempts: number;
  fails: number;
  avgSlipRealBps: number;
  avgSlipExpBps: number;
  penalty: number;
  failRate: number;
  excluded: boolean;
};

export function computeWindowStart(now: number, windowMinutes: number): number {
  const windowMs = Math.max(1, windowMinutes) * 60 * 1000;
  return Math.floor(now / windowMs) * windowMs;
}

export function loadRouteStats(config: RouteQuarantineConfig, windowStartTs: number): Map<string, RouteStatSnapshot> {
  const rows = getRouteStats(windowStartTs);
  const map = new Map<string, RouteStatSnapshot>();
  for (const row of rows) {
    const failRate = row.attempts > 0 ? row.fails / row.attempts : 0;
    const excluded = row.attempts >= config.minAttempts && failRate > config.failRateThreshold;
    map.set(row.route, {
      ...row,
      failRate,
      excluded
    });
  }
  return map;
}

export function recordRouteAttempt(params: {
  config: RouteQuarantineConfig;
  route: string;
  windowStartTs: number;
  success: boolean;
  slipRealBps: number;
  slipExpBps: number;
}): RouteStatSnapshot {
  const { config, route, windowStartTs, success } = params;
  const slipRealBps = Number.isFinite(params.slipRealBps) ? params.slipRealBps : 0;
  const slipExpBps = Number.isFinite(params.slipExpBps) ? params.slipExpBps : 0;
  const updated = upsertRouteStat({
    route,
    windowStartTs,
    success,
    slipRealBps,
    slipExpBps,
    weights: { slipExcessWeight: config.slipExcessWeight, failRateWeight: config.failRateWeight }
  });
  try {
    routeAttemptsTotal.inc({ route });
    if (!success) routeFailsTotal.inc({ route });
    routePenaltyGauge.set({ route }, updated.penalty);
  } catch {
    /* metrics optional */
  }
  const failRate = updated.attempts > 0 ? updated.fails / updated.attempts : 0;
  const excluded = updated.attempts >= config.minAttempts && failRate > config.failRateThreshold;
  return {
    ...updated,
    failRate,
    excluded
  };
}

export function markRouteExcluded(route: string): void {
  try {
    routesExcludedTotal.inc({ route });
  } catch {
    /* metrics optional */
  }
}
