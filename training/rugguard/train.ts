#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type VerdictRow = {
  mint: string;
  rugProb: number;
  safetyOk: number;
};

type Metrics = {
  threshold: number;
  precision: number;
  recall: number;
  positives: number;
  predicted: number;
  sampleCount: number;
};

function loadVerdicts(dbPath: string, limit = 5000): VerdictRow[] {
  try {
    const database = new Database(dbPath, { readonly: true, fileMustExist: false });
    const rows = database
      .prepare(`
        SELECT v.mint as mint, v.rug_prob as rugProb, c.safety_ok as safetyOk, v.ts as ts
        FROM rug_verdicts v
        JOIN candidates c ON c.mint = v.mint
        ORDER BY v.ts DESC
        LIMIT ?
      `)
      .all(limit * 3) as Array<{ mint: string; rugProb?: number; safetyOk?: number; ts: number }>;
    database.close();
    const seen = new Set<string>();
    const samples: VerdictRow[] = [];
    for (const row of rows) {
      if (seen.has(row.mint)) {
        continue;
      }
      seen.add(row.mint);
      samples.push({
        mint: row.mint,
        rugProb: typeof row.rugProb === 'number' ? row.rugProb : 0.5,
        safetyOk: row.safetyOk ? 1 : 0
      });
      if (samples.length >= limit) {
        break;
      }
    }
    return samples;
  } catch (err) {
    console.warn('[rugguard] unable to load verdicts', err instanceof Error ? err.message : err);
    return [];
  }
}

function computeMetrics(samples: VerdictRow[], threshold = 0.6): Metrics {
  let positives = 0;
  let predicted = 0;
  let truePositives = 0;
  for (const row of samples) {
    const label = row.safetyOk === 0 ? 1 : 0; // treat blocked candidates as positives
    if (label === 1) {
      positives += 1;
    }
    const prediction = row.rugProb >= threshold ? 1 : 0;
    if (prediction === 1) {
      predicted += 1;
    }
    if (prediction === 1 && label === 1) {
      truePositives += 1;
    }
  }
  const precision = predicted > 0 ? truePositives / predicted : 0;
  const recall = positives > 0 ? truePositives / positives : 0;
  return {
    threshold,
    precision,
    recall,
    positives,
    predicted,
    sampleCount: samples.length
  };
}

function main(): void {
  const dbPath = process.env.RUGGUARD_DB_PATH ?? path.resolve(process.cwd(), '../../data/trenches.db');
  const samples = loadVerdicts(dbPath);
  const metrics = computeMetrics(samples);
  console.log(
    `rugguard: samples=${metrics.sampleCount} positives=${metrics.positives} predicted=${metrics.predicted} ` +
      `precision=${metrics.precision.toFixed(3)} recall=${metrics.recall.toFixed(3)}`
  );

  const model = {
    weights: { w: [-1.0, -0.6, 0.4, 0.3] },
    threshold: metrics.threshold,
    metrics
  };

  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/rugguard_v2.json', JSON.stringify(model, null, 2));
}

main();
