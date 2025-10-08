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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function waitChildSuccess(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : 'unknown exit';
      reject(new Error(`${name} exited unexpectedly (${detail})`));
    });
    child.once('error', (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function monitorPersistent(child: ChildProcess, name: string) {
  let expected = false;
  let failure: Error | null = null;
  const describe = (code: number | null, signal: NodeJS.Signals | null) => {
    const parts: string[] = [];
    if (code !== null) parts.push(`code ${code}`);
    if (signal) parts.push(`signal ${signal}`);
    const detail = parts.length ? parts.join(', ') : 'unknown reason';
    return new Error(`${name} exited unexpectedly (${detail})`);
  };
  child.on('exit', (code, signal) => {
    if (expected) return;
    failure = describe(code, signal);
  });
  child.on('error', (err) => {
    if (expected) return;
    failure = err instanceof Error ? err : new Error(String(err));
  });
  return {
    getFailure: () => failure,
    markExpected: () => {
      expected = true;
    }
  };
}

function spawnCmd(cmd: string, args: string[], extraEnv: Record<string,string> = {}, name='proc'){
  const env = { ...process.env, ...extraEnv } as NodeJS.ProcessEnv;
  const child = spawn(cmd, args, { env, stdio: ['ignore','pipe','pipe'], shell: process.platform === 'win32' });
  child.stdout.on('data', d => process.stdout.write(`[${name}:out] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[${name}:err] ${d}`));
  return child;
}
function terminate(child: ChildProcess | null | undefined){
  if(!child || child.killed) return;
  try { child.kill('SIGINT'); } catch (err) {
    // process already terminated; nothing to do
  }
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
  }
}
async function waitForFile(file: string, timeoutMs=10000, failureChecks: Array<() => Error | null> = []){
  const t0 = Date.now();
  while (Date.now()-t0 < timeoutMs) {
    for (const check of failureChecks) {
      const err = check();
      if (err) throw err;
    }
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
    } catch (err) {
      // transient fs error; retry until timeout
    }
    await sleep(250);
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
  const gen = spawnCmd('pnpm', ['run','sample:plans:n'], {}, 'gen');
  const genExit = waitChildSuccess(gen, 'sample:plans:n');
  let genFailure: Error | null = null;
  genExit.catch((err) => { genFailure = err; });
  await waitForFile(PLAN_FILE, 10000, [() => genFailure]);
  if (genFailure) throw genFailure;
  await genExit;

  // 2) Start replay
  const replay = spawnCmd('pnpm', ['run','replay:plans'], {
    REPLAY_FILE: PLAN_FILE,
    REPLAY_PORT: String(REPLAY_PORT)
  }, 'replay');
  const replayMonitor = monitorPersistent(replay, 'replay:plans');

  // 3) Start dev stack (SHADOW + replay consume)
  const dev = spawnCmd('pnpm', ['run','dev:core'], {
    USE_REPLAY:'1',
    SOAK_REPLAY_URL: `http://127.0.0.1:${REPLAY_PORT}/events/plans`,
    ENABLE_SHADOW_OUTCOMES:'1',
    EXECUTOR_SHADOW_MODE:'1',
    NO_RPC:'1',
    DISABLE_PROVIDERS:'1',
    SQLITE_DB_PATH: DB
  }, 'dev');
  const devMonitor = monitorPersistent(dev, 'dev:core');

  // 4) Wait for rows/mints or time cap
  const db = new Database(DB);
  const t0 = Date.now();
  const timeCapMs = TIME_CAP_MIN*60000;
  while (Date.now() - t0 < timeCapMs) {
    await sleep(POLL_SEC*1000);
    const replayFailure = replayMonitor.getFailure();
    if (replayFailure) {
      throw replayFailure;
    }
    const devFailure = devMonitor.getFailure();
    if (devFailure) {
      throw devFailure;
    }
    const { rows, mints } = count(db);
    const elapsed = ((Date.now()-t0)/60000).toFixed(1);
    console.log(`[stp] rows=${rows} mints=${mints} elapsed=${elapsed}m`);
    if (rows >= TARGET_ROWS && mints >= TARGET_MINTS) {
      break;
    }
  }
  db.close();

  console.log('QUICK_STP: stopping soak...');
  devMonitor.markExpected();
  replayMonitor.markExpected();
  terminate(dev); terminate(replay);

  console.log('QUICK_STP: training (GPU) + promotion...');
  const train = spawnCmd('pnpm',['retrain:weekly:gpu'], {}, 'train');
  await waitChildSuccess(train, 'retrain:weekly:gpu');
  const gate = spawnCmd('pnpm',['promote:gate'], {}, 'promote');
  await waitChildSuccess(gate, 'promote:gate');

  // final counts
  const db2 = new Database(DB);
  const { rows: rowsAll, mints: mintsAll } = count(db2);
  db2.close();
  console.log(`QUICK_STP Summary: rowsAll=${rowsAll} mintsAll=${mintsAll}`);
})().catch(err=>{ console.error('QUICK_STP ERR', err); process.exit(1); });
