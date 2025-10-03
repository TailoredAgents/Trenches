import fs from 'fs';
import { createLogger } from '@trenches/logger';
import { sigmoid } from '@trenches/util';

type PumpModel = {
  dim: number;
  weights: number[];
  bias: number;
  embedder?: { type?: string; name?: string; dim?: number };
};

let model: PumpModel | null = null;
const logger = createLogger('safety-engine:pumpClassifier');
let embedDim = 512;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2).slice(0, 200);
}

function hashEmbed(text: string, dim = 512): number[] {
  const vec = new Array(dim).fill(0);
  const toks = tokenize(text);
  for (const t of toks) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i += 1) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0)) || 1;
  for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  return vec;
}

function ensureModel(): void {
  if (model !== null) return;
  try {
    const path = 'models/pump_classifier_v1.json';
    if (fs.existsSync(path)) {
      const raw = JSON.parse(fs.readFileSync(path, 'utf-8')) as PumpModel;
      if (Array.isArray(raw.weights) && typeof raw.bias === 'number') {
        model = raw;
        embedDim = raw.dim ?? raw.weights.length;
        return;
      }
    }
  } catch (err) {
    logger.error({ err }, 'failed to load pump classifier model');
  }
  model = null;
  embedDim = 512;
}

export function scoreText(text: string): number {
  ensureModel();
  const fallback = 0.5;
  if (!model) {
    const lower = text.toLowerCase();
    if (/(pump|100x|lambo|moon|rocket)/.test(lower)) {
      return 0.7;
    }
    if (/(roadmap|dev update|audit|open source)/.test(lower)) {
      return 0.35;
    }
    return fallback;
  }
  const dim = model.dim ?? embedDim;
  const vec = hashEmbed(text, dim);
  let z = model.bias;
  const limit = Math.min(dim, model.weights.length);
  for (let i = 0; i < limit; i += 1) {
    z += model.weights[i] * vec[i];
  }
  const p = sigmoid(z);
  if (!Number.isFinite(p)) {
    return fallback;
  }
  return Math.min(0.999, Math.max(0.001, p));
}


