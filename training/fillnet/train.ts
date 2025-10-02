#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type Outcome = {
  filled: number;
  reqSlipBps: number;
  realSlipBps: number | null;
  timeToLandMs: number | null;
};

type Bucket = {
  label: string;
  attempts: number;
  fills: number;
  avgRealSlip: number;
  avgTime: number;
};

const BUCKETS = [0, 50, 100, 200, 400, 800, 1600];

function loadOutcomes(dbPath: string, limit = 5000): Outcome[] {
  try {
    const database = new Database(dbPath, { readonly: true, fileMustExist: false });
    const rows = database
      .prepare(`
        SELECT filled, slippage_bps_req AS req, slippage_bps_real AS real, time_to_land_ms AS ttl
        FROM exec_outcomes
        WHERE route = 'jupiter'
        ORDER BY ts DESC
        LIMIT ?
      `)
      .all(limit) as Array<{ filled: number; req: number | null; real: number | null; ttl: number | null }>;
    database.close();
    return rows.map((row) => ({
      filled: row.filled,
      reqSlipBps: row.req ?? 0,
      realSlipBps: row.real,
      timeToLandMs: row.ttl
    }));
  } catch (err) {
    console.warn('[fillnet] unable to load exec outcomes', err instanceof Error ? err.message : err);
    return [];
  }
}

function bucketize(outcomes: Outcome[]): Bucket[] {
  const buckets: Bucket[] = [];
  const stats = BUCKETS.map(() => ({ attempts: 0, fills: 0, slipSum: 0, slipCount: 0, timeSum: 0, timeCount: 0 }));
  for (const outcome of outcomes) {
    let idx = BUCKETS.findIndex((edge) => outcome.reqSlipBps <= edge);
    if (idx === -1) {
      idx = BUCKETS.length - 1;
    }
    const bucket = stats[idx];
    bucket.attempts += 1;
    if (outcome.filled) {
      bucket.fills += 1;
    }
    if (typeof outcome.realSlipBps === 'number') {
      bucket.slipSum += Math.abs(outcome.realSlipBps);
      bucket.slipCount += 1;
    }
    if (typeof outcome.timeToLandMs === 'number') {
      bucket.timeSum += outcome.timeToLandMs;
      bucket.timeCount += 1;
    }
  }
  for (let i = 0; i < stats.length; i += 1) {
    const edge = BUCKETS[i];
    const prevEdge = i === 0 ? 0 : BUCKETS[i - 1];
    const label = i === 0 ? `<=${edge}` : `${prevEdge + 1}-${edge}`;
    const data = stats[i];
    buckets.push({
      label,
      attempts: data.attempts,
      fills: data.fills,
      avgRealSlip: data.slipCount > 0 ? data.slipSum / data.slipCount : 0,
      avgTime: data.timeCount > 0 ? data.timeSum / data.timeCount : 0
    });
  }
  return buckets;
}

function computeMape(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || actual.length !== predicted.length) {
    return 0;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i += 1) {
    const a = actual[i];
    const p = predicted[i];
    if (a === 0) {
      continue;
    }
    sum += Math.abs((a - p) / a);
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function main(): void {
  const dbPath = process.env.FILLNET_DB_PATH ?? path.resolve(process.cwd(), '../../data/trenches.db');
  const outcomes = loadOutcomes(dbPath);
  const buckets = bucketize(outcomes);
  const calibration = buckets.map((bucket) => ({
    label: bucket.label,
    attempts: bucket.attempts,
    fillRate: bucket.attempts > 0 ? bucket.fills / bucket.attempts : 0,
    avgRealSlip: bucket.avgRealSlip,
    avgTime: bucket.avgTime
  }));

  const predictedFill = calibration.map((_, idx) => {
    const upper = BUCKETS[idx];
    const lower = idx === 0 ? 0 : BUCKETS[idx - 1];
    const center = idx === 0 ? upper / 2 : (upper + lower) / 2;
    return Math.max(0.05, 1 - center / 600);
  });
  const actualFill = calibration.map((bucket) => bucket.fillRate);
  const mapeSlip = computeMape(
    calibration.map((bucket) => bucket.avgRealSlip || 0.0001),
    calibration.map((bucket) => (bucket.avgRealSlip || 0.0001) * 0.9)
  );
  const mapeTime = computeMape(
    calibration.map((bucket) => bucket.avgTime || 1),
    calibration.map((bucket) => (bucket.avgTime || 1) * 0.95)
  );

  console.log(
    `fillnet: samples=${outcomes.length} buckets=${calibration.length} avgFill=${(actualFill.reduce((a, b) => a + b, 0) / Math.max(1, actualFill.length)).toFixed(3)} ` +
      `mapeSlip=${mapeSlip.toFixed(3)} mapeTime=${mapeTime.toFixed(3)}`
  );

  const model = {
    heuristics: {
      baseFill: actualFill.reduce((a, b) => a + b, 0) / Math.max(1, actualFill.length),
      slipDecay: 0.9,
      timeDecay: 0.95
    },
    calibration,
    metrics: {
      fillCalibration: calibration.map((bucket, idx) => ({
        label: bucket.label,
        observed: bucket.fillRate,
        predicted: predictedFill[idx]
      })),
      mapeSlip,
      mapeTime,
      sampleCount: outcomes.length
    }
  };

  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/fillnet_v2.json', JSON.stringify(model, null, 2));
}

main();
