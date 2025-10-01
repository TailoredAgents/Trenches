#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';

const db = new DatabaseConstructor(process.env.SQLITE_DB_PATH ?? './data/trenches.db');
const row = db.prepare('SELECT COUNT(1) AS n FROM scores').get() as { n:number };
console.log('alpha-smoke: scores rows', row.n);

