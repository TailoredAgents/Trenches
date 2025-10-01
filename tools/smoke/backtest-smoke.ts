#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import { createBacktestRun, insertBacktestResult, finishBacktestRun } from '@trenches/persistence';

const db = new DatabaseConstructor(process.env.SQLITE_DB_PATH ?? './data/trenches.db');
const countRuns = db.prepare('SELECT COUNT(1) AS n FROM backtest_runs').get() as { n:number };
const runId = createBacktestRun({ smoke: true }, 'backtest-smoke');
insertBacktestResult(runId, 'landed_rate', 0.9, 'overall');
insertBacktestResult(runId, 'avg_slip_bps', 15, 'overall');
finishBacktestRun(runId);
console.log('backtest-smoke: created run', runId, 'previous runs', countRuns.n);

