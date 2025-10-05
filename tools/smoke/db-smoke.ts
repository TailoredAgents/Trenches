import 'dotenv/config';

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { getConfig } from '@trenches/config';

const TABLES = [
  'topics',
  'candidates',
  'orders',
  'fills',
  'positions',
  'events',
  'sizing_decisions',
  'sizing_outcomes',
  'fill_preds',
  'fee_decisions',
  'exec_outcomes',
  'migration_events',
  'scores',
  'rug_verdicts',
  'route_stats',
  'leader_wallets',
  'leader_hits',
  'hazard_states',
  'author_features'
] as const;

function resolveSqlitePath(relativePath: string): string | null {
  const candidates: string[] = [];
  const cwd = process.cwd();
  candidates.push(path.resolve(cwd, relativePath));
  const serviceDirs = [
    'agent-core',
    'executor',
    'features-job',
    'leader-wallets',
    'migration-watcher',
    'onchain-discovery',
    'policy-engine',
    'position-manager',
    'price-updater',
    'safety-engine',
    'social-ingestor'
  ];
  for (const dir of serviceDirs) {
    candidates.push(path.resolve(cwd, 'services', dir, relativePath));
  }
  for (const candidate of candidates) {
    const dirName = path.dirname(candidate);
    if (!fs.existsSync(dirName)) {
      continue;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function main(): void {
  const cfg = getConfig();
  const sqliteRelative = (cfg as any)?.persistence?.sqlitePath ?? '';
  if (!sqliteRelative || typeof sqliteRelative !== 'string') {
    console.log('db-smoke: missing=[all] ok=0');
    return;
  }

  const sqlitePath = resolveSqlitePath(sqliteRelative);
  if (!sqlitePath) {
    console.log('db-smoke: missing=[all] ok=0');
    return;
  }

  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true, timeout: 3000 });

  const missing: string[] = [];
  let okCount = 0;

  for (const table of TABLES) {
    try {
      const stmt = db.prepare(`SELECT count(*) as n FROM ${table}`);
      stmt.get();
      okCount += 1;
    } catch (err) {
      missing.push(table);
    }
  }

  db.close();

  const missingPart = missing.length > 0 ? missing.join(',') : 'none';
  console.log(`db-smoke: missing=[${missingPart}] ok=${okCount}`);
}

main();
