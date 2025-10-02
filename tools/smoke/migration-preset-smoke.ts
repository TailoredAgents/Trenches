#!/usr/bin/env tsx
import DatabaseConstructor from 'better-sqlite3';
import { loadConfig } from '@trenches/config';
import { getRegistry } from '@trenches/metrics';
import { applyMigrationPresetAdjustment } from '../../services/executor/src/migrationPreset';

const registry = getRegistry();

function parseMetricSum(text: string, metric: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith(metric))
    .reduce((sum, line) => {
      const parts = line.split(/\s+/);
      const last = Number(parts[parts.length - 1]);
      return Number.isFinite(last) ? sum + last : sum;
    }, 0);
}

function parseMetricValue(text: string, metric: string): number {
  const line = text
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .find((ln) => ln && !ln.startsWith('#') && ln.startsWith(metric));
  if (!line) return 0;
  const parts = line.split(/\s+/);
  const last = Number(parts[parts.length - 1]);
  return Number.isFinite(last) ? last : 0;
}

async function readMetricSum(metric: string): Promise<number> {
  const text = await registry.metrics();
  return parseMetricSum(text, metric);
}

async function readMetricValue(metric: string): Promise<number> {
  const text = await registry.metrics();
  return parseMetricValue(text, metric);
}

async function main() {
  const dbPath = process.env.SQLITE_DB_PATH ?? './data/trenches.db';
  const db = new DatabaseConstructor(dbPath);

  try {
    const preset = loadConfig().execution.migrationPreset;
    const mint = `SMOKE_MIG_${Date.now()}`;
    const pool = `${mint}_POOL`;
    const eventTs = Date.now() - 1_000;

    db.prepare('INSERT INTO migration_events (ts, mint, pool, source, init_sig) VALUES (@ts, @mint, @pool, @source, @initSig)')
      .run({ ts: eventTs, mint, pool, source: 'smoke', initSig: 'migration-preset-smoke' });

    const baseCuPrice = 1200;
    const baseSlipBps = 80;

    const beforeCount = await readMetricSum('executor_migration_preset_uses_total');

    const fresh = applyMigrationPresetAdjustment({
      preset,
      mint,
      pool,
      route: 'jupiter',
      baseCuPrice,
      baseSlippageBps: baseSlipBps,
      now: eventTs + 5_000
    });
    if (!fresh.applied) {
      throw new Error('migration preset failed to apply for fresh migration event');
    }
    if (fresh.cuPrice < baseCuPrice + preset.cuPriceBump) {
      throw new Error('expected compute unit price bump on fresh migration');
    }
    if (fresh.slippageBps < Math.max(baseSlipBps, preset.minSlippageBps)) {
      throw new Error('expected slippage to widen to preset minimum on fresh migration');
    }

    let mid = fresh;
    if (preset.decayMs > 0) {
      mid = applyMigrationPresetAdjustment({
        preset,
        mint,
        pool,
        route: 'jupiter',
        baseCuPrice,
        baseSlippageBps: baseSlipBps,
        now: eventTs + preset.durationMs + Math.floor(preset.decayMs / 2)
      });
      if (!mid.applied) {
        throw new Error('expected migration preset to apply during decay window');
      }
      const expectedBump = Math.round(preset.cuPriceBump * (1 - (mid.decayProgress ?? 0)));
      if (mid.cuPrice < baseCuPrice + expectedBump) {
        throw new Error('decay bump lower than expected');
      }
      const blendedSlip = Math.round(preset.minSlippageBps * (1 - (mid.decayProgress ?? 0)) + baseSlipBps * (mid.decayProgress ?? 0));
      if (mid.slippageBps < Math.max(baseSlipBps, blendedSlip)) {
        throw new Error('decay slippage did not honor interpolation target');
      }
    }

    const afterCount = await readMetricSum('executor_migration_preset_uses_total');
    if (afterCount <= beforeCount) {
      throw new Error('migration preset counter did not increment');
    }

    applyMigrationPresetAdjustment({
      preset,
      mint,
      pool,
      route: 'jupiter',
      baseCuPrice,
      baseSlippageBps: baseSlipBps,
      now: eventTs + preset.durationMs + preset.decayMs + 120_000
    });
    const gauge = await readMetricValue('executor_migration_preset_active');
    if (gauge !== 0) {
      throw new Error('migration preset gauge should reset to 0 when inactive');
    }

    const decayProgress = mid.decayProgress ?? 0;
    console.log(`migration-preset-smoke: freshCu=${fresh.cuPrice} midCu=${mid.cuPrice} freshSlip=${fresh.slippageBps} midSlip=${mid.slippageBps} decay=${decayProgress.toFixed(2)} usesDelta=${(afterCount - beforeCount).toFixed(0)}`);
  } finally {
    db.prepare('DELETE FROM migration_events WHERE init_sig = ?').run('migration-preset-smoke');
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
