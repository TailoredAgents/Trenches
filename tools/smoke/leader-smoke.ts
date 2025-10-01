#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';

const db = new DatabaseConstructor(process.env.SQLITE_DB_PATH ?? './data/trenches.db');
db.exec("CREATE TABLE IF NOT EXISTS leader_hits (pool TEXT, wallet TEXT, ts INTEGER);");
db.prepare('INSERT INTO leader_hits (pool, wallet, ts) VALUES (@pool,@wallet,@ts)').run({ pool: 'Pool111111111111111111111111111111111111111', wallet: 'Wallet11111111111111111111111111111111111111', ts: Date.now() });
const r = db.prepare('SELECT COUNT(1) AS c FROM leader_hits').get() as { c:number };
console.log('leader-smoke: hits', r.c);

