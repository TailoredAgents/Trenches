import DatabaseConstructor from 'better-sqlite3';
import { computeBacktestSummary } from '../backtest/src/metrics';
import { createBacktestRun, finishBacktestRun, insertBacktestResult } from '../../packages/persistence/src/index';

function nowIsoMinus(minutes: number): string {
  const d = new Date(Date.now() - minutes * 60 * 1000);
  return d.toISOString();
}

async function main(): Promise<void> {
  const dbPath = process.env.PERSISTENCE_SQLITE_PATH || './data/trenches.db';
  const db = new DatabaseConstructor(dbPath);
  const fromIso = nowIsoMinus(120);
  const toIso = new Date().toISOString();
  const fromTs = Date.parse(fromIso);
  const toTs = Date.parse(toIso);

  const summary = computeBacktestSummary(db, fromTs, toTs);
  console.log('backtest-smoke summary', {
    netUsd: summary.netUsd.toFixed(2),
    grossUsd: summary.grossUsd.toFixed(2),
    feeUsd: summary.feeUsd.toFixed(2),
    slipUsd: summary.slipUsd.toFixed(2),
    segments: Object.keys(summary.segments).length
  });

  const runId = createBacktestRun({ from: fromIso, to: toIso, windowMin: 120, smoke: true });
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
  finishBacktestRun(runId);

  const rows = db.prepare('SELECT COUNT(*) AS n FROM backtest_results WHERE run_id = ?').get(runId) as { n:number };
  if (!rows || rows.n <= 0) {
    throw new Error('backtest-smoke: no rows persisted');
  }
}

void main();

