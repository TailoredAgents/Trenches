#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import { computeBacktestSummary } from '../backtest/src/metrics';

const dbPath = process.env.SQLITE_DB_PATH ?? './data/trenches.db';

function toIso(ms:number) { return new Date(ms).toISOString(); }

async function main() {
  const db = new DatabaseConstructor(dbPath);
  const now = Date.now();
  const from = now - 60*60*1000; // last hour
  const summary = computeBacktestSummary(db, from, now);
  console.log('backtest-smoke', { from: toIso(from), to: toIso(now), netUsd: summary.netUsd.toFixed(2), grossUsd: summary.grossUsd.toFixed(2), feeUsd: summary.feeUsd.toFixed(2), slipUsd: summary.slipUsd.toFixed(2), segments: Object.keys(summary.segments).length });
  if (!Number.isFinite(summary.netUsd) || !Number.isFinite(summary.grossUsd) || !Number.isFinite(summary.feeUsd) || !Number.isFinite(summary.slipUsd)) {
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
