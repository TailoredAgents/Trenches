#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';

const db = new DatabaseConstructor(process.env.SQLITE_DB_PATH ?? './data/trenches.db');
const rows = db.prepare('SELECT hazard, trail_bps FROM hazard_states ORDER BY ts DESC LIMIT 200').all() as Array<{ hazard:number; trail_bps:number }>;
if (rows.length === 0) {
  console.log('No hazard_states rows. Run position-manager for a bit to generate.');
  process.exit(0);
}
const haz = rows.map(r => r.hazard);
const trails = rows.map(r => r.trail_bps);
const avg = haz.reduce((a,b)=>a+b,0)/haz.length;
const minH = Math.min(...haz), maxH = Math.max(...haz);
console.log('survival-smoke: avgHazard', avg.toFixed(3), 'min', minH.toFixed(3), 'max', maxH.toFixed(3));
console.log('trail bps: min', Math.min(...trails), 'max', Math.max(...trails));

