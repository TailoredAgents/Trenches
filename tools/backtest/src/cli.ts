#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { computeBacktestSummary } from './metrics';

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
  const { createBacktestRun, finishBacktestRun, insertBacktestResult } = await import('../../../packages/persistence/src/index');
  const runId = createBacktestRun({ from: argv.from, to: argv.to, windowMin: argv['window-min'], latency: argv.latency, costs: argv.costs, segments: argv.segments });
  const summary = computeBacktestSummary(db, fromTs, toTs);
  insertBacktestResult(runId, 'net_pnl_usd', summary.netUsd, 'overall');
  insertBacktestResult(runId, 'gross_usd', summary.grossUsd, 'overall');
  insertBacktestResult(runId, 'fee_usd', summary.feeUsd, 'overall');
  insertBacktestResult(runId, 'slip_usd', summary.slipUsd, 'overall');
  for (const [seg, vals] of Object.entries(summary.segments)) {
    insertBacktestResult(runId, 'net_pnl_usd', vals.netUsd, seg);
    insertBacktestResult(runId, 'gross_usd', vals.grossUsd, seg);
    insertBacktestResult(runId, 'fee_usd', vals.feeUsd, seg);
    insertBacktestResult(runId, 'slip_usd', vals.slipUsd, seg);
  }
  insertBacktestResult(runId, 'landed_rate', summary.metrics.landedRate, 'overall');
  insertBacktestResult(runId, 'avg_slip_bps', summary.metrics.avgSlipBps, 'overall');
  insertBacktestResult(runId, 'p50_ttl_ms', summary.metrics.p50Ttl, 'overall');
  insertBacktestResult(runId, 'p95_ttl_ms', summary.metrics.p95Ttl, 'overall');
  finishBacktestRun(runId);
  console.log('Backtest run', runId, 'summary:', JSON.stringify(summary));
}

main().catch((err) => { console.error(err); process.exit(1); });






