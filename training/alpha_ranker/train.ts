#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type Sample = { score: number; label: number };

function loadSamples(dbPath: string, limit = 2000): Sample[] {
  try {
    const database = new Database(dbPath, { readonly: true, fileMustExist: false });
    const stmt = database.prepare(`
      SELECT s.mint as mint, s.score as score, c.safety_ok as safetyOk
      FROM scores s
      JOIN candidates c ON c.mint = s.mint
      WHERE s.horizon = ?
      ORDER BY s.ts DESC
      LIMIT ?
    `);
    const rows = stmt.all('10m', limit * 3) as Array<{ mint: string; score?: number; safetyOk?: number }>;
    database.close();
    const seen = new Set<string>();
    const samples: Sample[] = [];
    for (const row of rows) {
      if (seen.has(row.mint)) {
        continue;
      }
      seen.add(row.mint);
      const score = typeof row.score === 'number' ? row.score : 0;
      const label = row.safetyOk ? 1 : 0;
      samples.push({ score, label });
      if (samples.length >= limit) {
        break;
      }
    }
    return samples;
  } catch (err) {
    console.warn('[alpha-ranker] dataset unavailable', err instanceof Error ? err.message : err);
    return [];
  }
}

function computeAuc(samples: Sample[]): number {
  const positives = samples.filter((s) => s.label === 1);
  const negatives = samples.length - positives.length;
  if (positives.length === 0 || negatives === 0) {
    return 0.5;
  }
  const sorted = [...samples].sort((a, b) => b.score - a.score);
  let rankSum = 0;
  let rank = 1;
  for (const sample of sorted) {
    if (sample.label === 1) {
      rankSum += rank;
    }
    rank += 1;
  }
  return (rankSum - (positives.length * (positives.length + 1)) / 2) / (positives.length * negatives);
}

function computePrecisionAtK(samples: Sample[], k: number): number {
  if (samples.length === 0 || k <= 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, Math.min(k, sorted.length));
  const positives = top.filter((s) => s.label === 1).length;
  return positives / top.length;
}

function main(): void {
  const dbPath = process.env.ALPHA_DB_PATH ?? path.resolve(process.cwd(), '../../data/trenches.db');
  const samples = loadSamples(dbPath);
  const auc = samples.length > 0 ? computeAuc(samples) : 0.5;
  const prAt50 = samples.length > 0 ? computePrecisionAtK(samples, 50) : 0;
  console.log(`alpha-ranker: samples=${samples.length} auc=${auc.toFixed(3)} pr@50=${prAt50.toFixed(3)}`);

  const horizons = ['10m', '60m', '24h'];
  const meanScore = samples.length > 0 ? samples.reduce((sum, s) => sum + s.score, 0) / samples.length : 0.5;
  const model = {
    horizons,
    weights: { bias: meanScore },
    metrics: { auc, precisionAt50: prAt50, sampleCount: samples.length }
  };

  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/alpha_ranker_v1.json', JSON.stringify(model, null, 2));
}

main();
