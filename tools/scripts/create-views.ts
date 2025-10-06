import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dbPath = process.env.PERSISTENCE_SQLITE_PATH || './data/trenches.db';
const sqlPath = path.resolve('tools/sql/create_training_views.sql');

try {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const db = new Database(dbPath);
  db.exec('BEGIN');
  try {
    db.exec(sql);
    db.exec('COMMIT');
    console.log('VIEWS_APPLIED');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('ERR', e);
    process.exit(1);
  } finally {
    db.close();
  }
} catch (e) {
  console.error('ERR_READ_SQL', e);
  process.exit(1);
}

