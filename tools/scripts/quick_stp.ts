import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import Database from 'better-sqlite3';

const DB = process.env.SQLITE_DB_PATH
  || process.env.PERSISTENCE_SQLITE_PATH
  || path.resolve(process.cwd(), 'data', 'trenches.db');
const PLAN_FILE = path.resolve(process.cwd(), process.env.STP_PLAN_FILE ?? path.join('tmp','plans.ndjson'));
const REPLAY_PORT = Number(process.env.STP_REPLAY_PORT ?? 4999);
const TARGET_ROWS = Number(process.env.STP_TARGET_ROWS || 3500);
const TARGET_MINTS = Number(process.env.STP_TARGET_MINTS || 120);
const TIME_CAP_MIN = Number(process.env.STP_TIME_CAP_MIN || 20);
const POLL_SEC = Number(process.env.STP_POLL_SEC || 5);

function spawnCmd(cmd: string, args: string[], extraEnv: Record<string,string> = {}, name='proc'){
  const env = { ...process.env, ...extraEnv } as NodeJS.ProcessEnv;
  const child = spawn(cmd, args, { env, stdio: ['ignore','pipe','pipe'], shell: process.platform === 'win32' });
  child.stdout.on('data', d => process.stdout.write(`[${name}:out] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[${name}:err] ${d}`));
  return child;
}
function terminate(child: ChildProcess | null | undefined){
  if(!child || child.killed) return;
  try { child.kill('SIGINT'); } catch {}
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}
async function waitForFile(file: string, timeoutMs=10000){
  const t0 = Date.now();
  while (Date.now()-t0 < timeoutMs) {
    try { if (fs.existsSync(file) && fs.statSync(file).size > 0) return; } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error(`plan file not found: ${file}`);
}

function count(db: Database.Database){
  const r = db.prepare('SELECT COUNT(*) n FROM sim_exec_outcomes').get();
  const m = db.prepare('SELECT COUNT(DISTINCT mint) m FROM sim_exec_outcomes WHERE mint IS NOT NULL').get();
  return { rows: Number(r?.n||0), mints: Number(m?.m||0) };
}

(async () => {
  console.log('QUICK_STP: starting soak...');

  // 1) Generate plans
  spawnCmd('pnpm', ['run','sample:plans:n'], {}, 'gen');
  await waitForFile(PLAN_FILE);

  // 2) Start replay
  const replay = spawnCmd('pnpm', ['run','replay:plans'], {
    REPLAY_FILE: PLAN_FILE,
    REPLAY_PORT: String(REPLAY_PORT)
  }, 'replay');

  // 3) Start dev stack (SHADOW + replay consume)
  const dev = spawnCmd('pnpm', ['run','dev:core'], {
    USE_REPLAY:'1',
    SOAK_REPLAY_URL: `http://127.0.0.1:${REPLAY_PORT}/events/plans`,
    ENABLE_SHADOW_OUTCOMES:'1',
    EXECUTOR_SHADOW_MODE:'1',
    SQLITE_DB_PATH: DB
  }, 'dev');

  // 4) Wait for rows/mints or time cap
  const db = new Database(DB);
  const t0 = Date.now();
  while (true) {
    await new Promise(r=>setTimeout(r,POLL_SEC*1000));
    const { rows, mints } = count(db);
    const elapsed = ((Date.now()-t0)/60000).toFixed(1);
    console.log(`[stp] rows=${rows} mints=${mints} elapsed=${elapsed}m`);
    if ((rows >= TARGET_ROWS && mints >= TARGET_MINTS) || (Date.now()-t0) >= TIME_CAP_MIN*60000) break;
  }
  db.close();

  console.log('QUICK_STP: stopping soak...');
  terminate(dev); terminate(replay);

  console.log('QUICK_STP: training (GPU) + promotion...');
  const train = spawnCmd('pnpm',['retrain:weekly:gpu'], {}, 'train');
  await new Promise(r=>train.on('close', r));
  const gate = spawnCmd('pnpm',['promote:gate'], {}, 'promote');
  await new Promise(r=>gate.on('close', r));

  // final counts
  const db2 = new Database(DB);
  const { rows: rowsAll, mints: mintsAll } = count(db2);
  db2.close();
  console.log(`QUICK_STP Summary: rowsAll=${rowsAll} mintsAll=${mintsAll}`);
})().catch(err=>{ console.error('QUICK_STP ERR', err); process.exit(1); });
