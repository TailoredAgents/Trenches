#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';

const db = new DatabaseConstructor(process.env.SQLITE_DB_PATH ?? './data/trenches.db');
const decs = db.prepare('SELECT ts, mint, arm, notional FROM sizing_decisions WHERE ts IS NOT NULL ORDER BY ts DESC LIMIT 200').all() as Array<{ ts:number; mint:string; arm:string; notional:number }>;
const sk = decs.filter(d => !d.arm || d.notional<=0).length;
const byArm: Record<string, number> = {};
for (const d of decs) { byArm[d.arm] = (byArm[d.arm] ?? 0) + 1; }
const total = decs.length || 1;
const dist = Object.entries(byArm).map(([arm,n]) => ({ arm, share: (n/total) }));
console.log('sizing-smoke: decisions', total, 'skips', sk);
console.log('distribution:');
for (const r of dist) { console.log(r.arm, (r.share*100).toFixed(1)+'%'); }

