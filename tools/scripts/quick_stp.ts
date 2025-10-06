import 'dotenv/config';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';

const DB = process.env.PERSISTENCE_SQLITE_PATH || './data/trenches.db';

const USE_REPLAY = process.env.USE_REPLAY === '1';
const TARGET_ROWS = Number(process.env.STP_TARGET_ROWS || 3000);
const TARGET_MINTS = Number(process.env.STP_TARGET_MINTS || 100);
const TIME_CAP_MIN = Number(process.env.STP_TIME_CAP_MIN || 90);
const POLL_SEC = Number(process.env.STP_POLL_SEC || 15);

function countRows(db: Database.Database, sinceSec?: number) {
  const row = sinceSec
    ? db
        .prepare(
          `SELECT COUNT(*) AS n FROM sim_exec_outcomes WHERE (CASE WHEN ts>20000000000 THEN ts/1000 ELSE ts END) >= ?`
        )
        .get(Math.floor(Date.now() / 1000) - sinceSec)
    : db.prepare(`SELECT COUNT(*) AS n FROM sim_exec_outcomes`).get();
  return Number((row as any)?.n || 0);
}

function countMints(db: Database.Database, sinceSec?: number) {
  const row = sinceSec
    ? db
        .prepare(
          `SELECT COUNT(DISTINCT mint) AS m FROM sim_exec_outcomes WHERE mint IS NOT NULL AND (CASE WHEN ts>20000000000 THEN ts/1000 ELSE ts END) >= ?`
        )
        .get(Math.floor(Date.now() / 1000) - sinceSec)
    : db.prepare(`SELECT COUNT(DISTINCT mint) AS m FROM sim_exec_outcomes WHERE mint IS NOT NULL`).get();
  return Number((row as any)?.m || 0);
}

function spawnCmd(cmd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const env = { ...process.env, ...extraEnv } as NodeJS.ProcessEnv;
  const child = spawn(cmd, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });
  child.stdout.on('data', (d) => process.stdout.write(d));
  child.stderr.on('data', (d) => process.stderr.write(d));
  return child;
}

async function main() {
  console.log('QUICK_STP: starting soak...');
  let devCore: any, replaySrv: any;

  if (USE_REPLAY) {
    spawnCmd('pnpm', ['sample:plans']);
    replaySrv = spawnCmd('pnpm', ['replay:plans', '--file', './tmp/plans.ndjson', '--port', '4999']);
    devCore = spawnCmd('pnpm', ['dev:core'], {
      ENABLE_SHADOW_OUTCOMES: '1',
      EXECUTOR_SHADOW_MODE: '1',
      SOAK_REPLAY_URL: 'http://127.0.0.1:4999/events/plans'
    });
  } else {
    devCore = spawnCmd('pnpm', ['dev:core'], {
      FAST_SOAK_MODE: '1',
      ENABLE_SHADOW_OUTCOMES: '1',
      EXECUTOR_SHADOW_MODE: '1'
    });
  }

  const db = new Database(DB);
  const start = Date.now();
  let ok = false;

  while (true) {
    await new Promise((r) => setTimeout(r, POLL_SEC * 1000));
    const rows24h = countRows(db, 24 * 3600);
    const mints24h = countMints(db, 24 * 3600);
    const elapsedMin = (Date.now() - start) / 60000;
    console.log(`soak: rows24h=${rows24h} mints24h=${mints24h} elapsed=${elapsedMin.toFixed(1)}m`);
    if ((rows24h >= TARGET_ROWS && mints24h >= TARGET_MINTS) || elapsedMin >= TIME_CAP_MIN) {
      ok = true;
      break;
    }
  }

  console.log('QUICK_STP: stopping soak...');
  try {
    if (devCore && !devCore.killed) devCore.kill('SIGINT');
  } catch {}
  try {
    if (replaySrv && !replaySrv.killed) replaySrv.kill('SIGINT');
  } catch {}

  if (!ok) {
    console.log('QUICK_STP: time cap hit; proceeding anyway.');
  }

  console.log('QUICK_STP: training (GPU) + promotion...');
  const train = spawnCmd('pnpm', ['retrain:weekly:gpu']);
  await new Promise((r) => train.on('close', r));
  const gate = spawnCmd('pnpm', ['promote:gate']);
  await new Promise((r) => gate.on('close', r));

  const rowsAll = countRows(db);
  const mintsAll = countMints(db);
  console.log(`QUICK_STP Summary: rowsAll=${rowsAll} mintsAll=${mintsAll} elapsedMin=${((Date.now() - start) / 60000).toFixed(1)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('QUICK_STP ERR', err);
  process.exit(1);
});

