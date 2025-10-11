import { getDb, closeDb } from '@trenches/persistence';

const DEFAULT_EXEC_ROWS = 1200;
const DEFAULT_FILL_ROWS = 600;
const DEFAULT_RUG_ROWS = 150;
const DEFAULT_SCORE_ROWS = 800;

const NOTE_TAG = 'seed_sample_data';

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

(() => {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const mints = Array.from({ length: 120 }, (_, idx) => `MINT${idx.toString().padStart(4, '0')}`);
  const routes = ['jupiter', 'orion', 'meteora'];
  const horizons = ['10m', '60m'];

  const execStmt = db.prepare(
    `INSERT INTO exec_outcomes(
      ts,
      quote_price,
      exec_price,
      filled,
      route,
      cu_price,
      slippage_bps_req,
      slippage_bps_real,
      time_to_land_ms,
      error_code,
      notes,
      priority_fee_lamports,
      amount_in,
      amount_out,
      fee_lamports_total,
      mint,
      order_id,
      side
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const simStmt = db.prepare(
    `INSERT INTO sim_exec_outcomes(
      ts,
      mint,
      route,
      filled,
      quote_price,
      exec_price,
      slippage_bps_req,
      slippage_bps_real,
      time_to_land_ms,
      cu_price,
      amount_in,
      amount_out,
      source
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  const fillStmt = db.prepare(
    `INSERT INTO fills(
      signature,
      mint,
      price,
      quantity,
      route,
      tip_lamports,
      slot,
      created_at
    ) VALUES (?,?,?,?,?,?,?,?)`
  );

  const rugStmt = db.prepare(
    `INSERT INTO rug_verdicts(
      ts,
      mint,
      rug_prob,
      reasons_json
    ) VALUES (?,?,?,?)`
  );

  const scoreStmt = db.prepare(
    `INSERT INTO scores(
      ts,
      mint,
      horizon,
      score,
      features_json
    ) VALUES (?,?,?,?,?)`
  );

  const cleanupStatements = [
    `DELETE FROM exec_outcomes WHERE notes = '${NOTE_TAG}'`,
    `DELETE FROM sim_exec_outcomes WHERE source = '${NOTE_TAG}'`,
    `DELETE FROM fills WHERE signature LIKE 'seed_%'`,
    `DELETE FROM rug_verdicts WHERE reasons_json LIKE '%${NOTE_TAG}%'`,
    `DELETE FROM scores WHERE features_json LIKE '%${NOTE_TAG}%'`
  ];

  const seedTx = db.transaction(() => {
    cleanupStatements.forEach((sql) => db.exec(sql));

    for (let i = 0; i < DEFAULT_EXEC_ROWS; i += 1) {
      const mint = pick(mints);
      const ts = now - i * 30;
      const route = pick(routes);
      const orderId = `order_${mint}_${i}`;
      const filled = Math.random() > 0.05 ? 1 : 0;
      execStmt.run(
        ts,
        randomInRange(0.5, 4.0),
        randomInRange(0.5, 4.0),
        filled,
        route,
        Math.floor(randomInRange(1_000, 10_000)),
        Math.floor(randomInRange(50, 350)),
        Math.floor(randomInRange(-80, 120)),
        Math.floor(randomInRange(150, 2500)),
        null,
        NOTE_TAG,
        Math.floor(randomInRange(10_000, 50_000)),
        Math.floor(randomInRange(100_000, 400_000)),
        Math.floor(randomInRange(100_000, 400_000)),
        Math.floor(randomInRange(20_000, 80_000)),
        mint,
        orderId,
        'buy'
      );

      simStmt.run(
        ts,
        mint,
        route,
        filled,
        randomInRange(0.5, 4.0),
        randomInRange(0.5, 4.0),
        Math.floor(randomInRange(50, 350)),
        Math.floor(randomInRange(-80, 120)),
        Math.floor(randomInRange(150, 2500)),
        Math.floor(randomInRange(1_000, 10_000)),
        Math.floor(randomInRange(100_000, 400_000)),
        Math.floor(randomInRange(100_000, 400_000)),
        NOTE_TAG
      );
    }

    for (let i = 0; i < DEFAULT_FILL_ROWS; i += 1) {
      const mint = pick(mints);
      const createdTs = now - i;
      const createdIso = new Date(createdTs * 1000).toISOString();
      fillStmt.run(
        `seed_${i}_${mint}`,
        mint,
        randomInRange(0.5, 4.0),
        randomInRange(10_000, 40_000),
        pick(routes),
        Math.floor(randomInRange(5_000, 20_000)),
        createdTs,
        createdIso
      );
    }

    for (let i = 0; i < DEFAULT_RUG_ROWS; i += 1) {
      const mint = pick(mints);
      rugStmt.run(now - i * 60, mint, randomInRange(0, 1), JSON.stringify({ source: NOTE_TAG }));
    }

    for (let i = 0; i < DEFAULT_SCORE_ROWS; i += 1) {
      const mint = pick(mints);
      const horizon = pick(horizons);
      const score = randomInRange(0, 1);
      scoreStmt.run(
        now - i * 45,
        mint,
        horizon,
        score,
        JSON.stringify({ source: NOTE_TAG, score })
      );
    }
  });

  try {
    seedTx();
    console.log('Seeded training data with sample rows.');
  } catch (err) {
    console.error('Failed to seed training data', err);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
})();
