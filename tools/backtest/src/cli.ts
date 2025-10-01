#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { computeExecMetrics } from './metrics';

const argv = yargs(hideBin(process.argv))
  .option('db', { type: 'string', default: './data/trenches.db' })
  .option('from', { type: 'string', default: '' })
  .option('to', { type: 'string', default: '' })
  .option('window-min', { type: 'number', default: 10 })
  .option('latency', { type: 'string', default: '' })
  .option('costs', { type: 'string', default: 'priorityFee=on,failedTx=on' })
  .option('segments', { type: 'string', default: 'overall' })
  .strict()
  .parseSync();

function toEpoch(s?: string): number | undefined {
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

async function main() {
  const db = new DatabaseConstructor(argv.db);
  const fromTs = toEpoch(argv.from);
  const toTs = toEpoch(argv.to);
  // Create run
  const { createBacktestRun, finishBacktestRun, insertBacktestResult } = await import('@trenches/persistence');
  const runId = createBacktestRun({ from: argv.from, to: argv.to, windowMin: argv['window-min'], latency: argv.latency, costs: argv.costs, segments: argv.segments });
  const m = computeExecMetrics(db, fromTs, toTs);
  insertBacktestResult(runId, 'landed_rate', m.landedRate, 'overall');
  insertBacktestResult(runId, 'avg_slip_bps', m.avgSlipBps, 'overall');
  insertBacktestResult(runId, 'p50_ttl_ms', m.p50Ttl, 'overall');
  insertBacktestResult(runId, 'p95_ttl_ms', m.p95Ttl, 'overall');
  finishBacktestRun(runId);
  console.log('Backtest run', runId, 'results:', m);
}

main().catch((err) => { console.error(err); process.exit(1); });

