#!/usr/bin/env tsx
import 'dotenv/config';
import * as fs from 'fs';
import * as readline from 'readline';
import Database from 'better-sqlite3';

const dbPath = process.env.PERSISTENCE_SQLITE_PATH || './data/trenches.db';
const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('usage: pnpm sim:import <ndjson-file>');
  process.exit(1);
}
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS sim_exec_outcomes(
    ts INTEGER,
    mint TEXT,
    route TEXT,
    filled INTEGER,
    quote_price REAL,
    exec_price REAL,
    slippage_bps_req INTEGER,
    slippage_bps_real REAL,
    time_to_land_ms INTEGER,
    cu_price INTEGER,
    amount_in INTEGER,
    amount_out INTEGER,
    source TEXT DEFAULT 'sim',
    PRIMARY KEY(mint, ts, route)
  );
`);

const ins = db.prepare(`
  INSERT OR IGNORE INTO sim_exec_outcomes
  (ts,mint,route,filled,quote_price,exec_price,slippage_bps_req,slippage_bps_real,time_to_land_ms,cu_price,amount_in,amount_out,source)
  VALUES (@ts,@mint,@route,@filled,@quote_price,@exec_price,@slippageReq,@slippageReal,@timeToLandMs,@cu_price,@amountIn,@amountOut,@source)
`);

const rl = readline.createInterface({ input: fs.createReadStream(file) });
let n = 0;
db.exec('BEGIN');
rl.on('line', (line) => {
  try {
    const o = JSON.parse(line);
    ins.run(o);
    n += 1;
  } catch {}
});
rl.on('close', () => {
  db.exec('COMMIT');
  console.log('SIM_IMPORTED', n);
});
