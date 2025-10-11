import { getDb, closeDb } from '@trenches/persistence';

type TableRequirement = {
  name: string;
  minRows: number;
};

const TABLE_REQUIREMENTS: TableRequirement[] = [
  { name: 'exec_outcomes', minRows: 1000 },
  { name: 'sim_exec_outcomes', minRows: 1000 },
  { name: 'fills', minRows: 500 },
  { name: 'rug_verdicts', minRows: 100 },
  { name: 'scores', minRows: 500 }
];

const TRAINING_VIEWS = [
  'fill_training_view',
  'alpha_training_view',
  'rug_training_view',
  'survival_training_view'
];

(async () => {
  const db = getDb();
  let failures = 0;

  for (const req of TABLE_REQUIREMENTS) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${req.name}`).get() as { n?: number } | undefined;
      const count = Number(row?.n ?? 0);
      if (!Number.isFinite(count)) {
        console.log(`${req.name}: unable to read row count`);
        failures += 1;
        continue;
      }
      console.log(`${req.name}: ${count} rows`);
      if (count < req.minRows) {
        console.warn(`WARNING: ${req.name} below recommended minimum (${count} < ${req.minRows})`);
        failures += 1;
      }
    } catch (err) {
      console.warn(`WARNING: failed to query ${req.name}`, err);
      failures += 1;
    }
  }

  for (const view of TRAINING_VIEWS) {
    try {
      const row = db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = ? LIMIT 1`)
        .get(view);
      const exists = row !== undefined;
      if (!exists) {
        console.warn(`WARNING: training view missing (${view})`);
        failures += 1;
      } else {
        console.log(`view ready: ${view}`);
      }
    } catch (err) {
      console.warn(`WARNING: failed to inspect view ${view}`, err);
      failures += 1;
    }
  }

  closeDb();

  if (failures > 0) {
    console.error(`Training data check completed with ${failures} issue(s).`);
    process.exit(1);
  } else {
    console.log('Training data check complete. All prerequisites satisfied.');
  }
})();
