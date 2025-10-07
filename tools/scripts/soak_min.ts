import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import Database from 'better-sqlite3';

type P = Promise<void>;

const ROOT = process.cwd();
const DB_PATH = process.env.SQLITE_DB_PATH
  || process.env.PERSISTENCE_SQLITE_PATH
  || path.resolve(ROOT, 'data', 'trenches.db');
const PLAN_FILE = path.resolve(ROOT, process.env.STP_PLAN_FILE ?? path.join('tmp','plans.ndjson'));
const TARGET_ROWS = Number(process.env.STP_TARGET_ROWS || 800);
const TARGET_MINTS = Number(process.env.STP_TARGET_MINTS || 40);
const TIME_CAP_SEC = Number(process.env.STP_TIME_CAP_SEC || 180);
const POLL_MS = Number(process.env.STP_POLL_MS || 3000);

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
  try { child.kill('SIGINT'); } catch {}
  if (process.platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true }); } catch {}
  }
}

async function ensurePlans(): P {
  if (fs.existsSync(PLAN_FILE) && fs.statSync(PLAN_FILE).size > 0) return;
  await new Promise<void>((resolve, reject) => {
    const p = spawnCmd('pnpm', ['run','sample:plans:n'], {}, 'gen');
    waitChildSuccess(p, 'sample:plans:n').then(resolve).catch(reject);
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try { if (fs.existsSync(PLAN_FILE) && fs.statSync(PLAN_FILE).size > 0) return; } catch {}
    await sleep(200);
  }
  throw new Error('plan file not found');
}

async function startInlineReplay(lines: string[]): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.includes('/events/plans')) { res.statusCode = 404; res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    let i = 0;
    const t = setInterval(() => {
      if (i >= lines.length) { clearInterval(t); res.end(); return; }
      res.write(`data: ${lines[i++]}` + '\n\n');
    }, 5);
    req.on('close', () => clearInterval(t));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', (e) => reject(e));
    server.listen(0, '127.0.0.1');
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind inline replay');
  const port = address.port;
  console.log(`serving (inline) port=${port} lines=${lines.length}`);
  return { port, close: () => { try { server.close(); } catch {} } };
}

function count(db: Database.Database){
  const r = db.prepare('SELECT COUNT(*) n FROM sim_exec_outcomes').get() as { n?: number } | undefined;
  const m = db.prepare('SELECT COUNT(DISTINCT mint) m FROM sim_exec_outcomes WHERE mint IS NOT NULL').get() as { m?: number } | undefined;
  return { rows: Number(r?.n||0), mints: Number(m?.m||0) };
}

async function main(){
  console.log('SOAK_MIN: preflight...');
  await ensurePlans();
  const lines = fs.readFileSync(PLAN_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const srv = await startInlineReplay(lines);

  console.log('SOAK_MIN: starting executor...');
  const exec = spawnCmd('pnpm', ['-F','@trenches/executor','run','dev'], {
    USE_REPLAY: '1',
    SOAK_REPLAY_URL: `http://127.0.0.1:${srv.port}/events/plans`,
    ENABLE_SHADOW_OUTCOMES: '1',
    EXECUTOR_SHADOW_MODE: '1',
    NO_RPC: '1',
    DISABLE_PROVIDERS: '1',
    SQLITE_DB_PATH: DB_PATH,
    EXECUTOR_PORT: '0',
    HEALTH_PORT: '0'
  }, 'exec');
  const execMonitor = monitorPersistent(exec, '@trenches/executor dev');

  const db = new Database(DB_PATH);
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < TIME_CAP_SEC * 1000) {
    await sleep(POLL_MS);
    const execFailure = execMonitor.getFailure();
    if (execFailure) {
      throw execFailure;
    }
    const { rows, mints } = count(db);
    console.log(`[soak-min] rows=${rows} mints=${mints} elapsed=${((Date.now()-t0)/1000).toFixed(0)}s`);
    if (rows >= TARGET_ROWS && mints >= TARGET_MINTS) { ok = true; break; }
  }
  db.close();

  console.log('SOAK_MIN: stopping executor...');
  execMonitor.markExpected();
  terminate(exec); srv.close();

  console.log('SOAK_MIN: training (GPU) + promotion...');
  const train = spawnCmd('pnpm', ['retrain:weekly:gpu'], {}, 'train');
  await waitChildSuccess(train, 'retrain:weekly:gpu');
  const gate = spawnCmd('pnpm', ['promote:gate'], {}, 'promote');
  await waitChildSuccess(gate, 'promote:gate');

  const db2 = new Database(DB_PATH);
  const { rows: rowsAll, mints: mintsAll } = count(db2);
  db2.close();
  console.log(`SOAK_MIN Summary: rowsAll=${rowsAll} mintsAll=${mintsAll} ok=${ok}`);
  process.exit(0);
}

main().catch(err => { console.error('SOAK_MIN ERR', err); process.exit(1); });
