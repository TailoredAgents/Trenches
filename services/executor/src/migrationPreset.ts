import { getLatestMigrationEvent } from '@trenches/persistence';
import { clamp01 } from '@trenches/util';
import { migrationPresetActive, migrationPresetUses } from './metrics';

export type MigrationPresetConfig = {
  enabled: boolean;
  durationMs: number;
  cuPriceBump: number;
  minSlippageBps: number;
  decayMs: number;
};

export type MigrationPresetInput = {
  preset: MigrationPresetConfig;
  mint: string;
  route?: string;
  pool?: string | null;
  baseCuPrice: number;
  baseSlippageBps: number;
  now?: number;
};

export type MigrationPresetResult = {
  cuPrice: number;
  slippageBps: number;
  applied: boolean;
  migrationTs?: number;
  ageMs?: number;
  decayProgress?: number;
};

export function applyMigrationPresetAdjustment(input: MigrationPresetInput): MigrationPresetResult {
  const { preset } = input;
  const now = input.now ?? Date.now();
  const baseCu = input.baseCuPrice;
  const baseSlip = input.baseSlippageBps;

  let cuPrice = baseCu;
  let slippageBps = baseSlip;
  let applied = false;
  let migrationTs: number | undefined;
  let ageMs: number | undefined;
  let decayProgress: number | undefined;

  try {
    if (!preset?.enabled) {
      migrationPresetActive.set(0);
      return { cuPrice, slippageBps, applied, migrationTs, ageMs, decayProgress };
    }

    const latest = getLatestMigrationEvent({ mint: input.mint, pool: input.pool ?? undefined });
    if (!latest) {
      migrationPresetActive.set(0);
      return { cuPrice, slippageBps, applied, migrationTs, ageMs, decayProgress };
    }

    migrationTs = latest.ts;
    ageMs = Math.max(0, now - latest.ts);

    if (ageMs <= preset.durationMs) {
      cuPrice = baseCu + preset.cuPriceBump;
      slippageBps = Math.max(baseSlip, preset.minSlippageBps);
      applied = cuPrice !== baseCu || slippageBps !== baseSlip;
      decayProgress = 0;
    } else if (preset.decayMs > 0 && ageMs <= preset.durationMs + preset.decayMs) {
      const progress = clamp01((ageMs - preset.durationMs) / preset.decayMs);
      const weight = 1 - progress;
      const bump = Math.round(preset.cuPriceBump * weight);
      const blendedSlip = Math.round(preset.minSlippageBps * weight + baseSlip * progress);
      cuPrice = baseCu + bump;
      slippageBps = Math.max(baseSlip, blendedSlip);
      applied = bump > 0 || slippageBps > baseSlip;
      decayProgress = progress;
    } else {
      decayProgress = 1;
    }
  } catch (err) {
    migrationPresetActive.set(0);
    return { cuPrice, slippageBps, applied: false };
  }

  migrationPresetActive.set(applied ? 1 : 0);
  if (applied) {
    migrationPresetUses.inc({ mint: input.mint, route: input.route ?? 'unknown' });
  }

  return { cuPrice, slippageBps, applied, migrationTs, ageMs, decayProgress };
}

