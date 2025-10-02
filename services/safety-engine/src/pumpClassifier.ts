import fs from 'fs';

type PumpModel = { dim: number; weights: number[]; bias: number };
let model: PumpModel | null = null;

function ensureModel(): void {
  if (model !== null) return;
  try {
    const path = 'models/pump_classifier_v1.json';
    if (fs.existsSync(path)) {
      const raw = JSON.parse(fs.readFileSync(path, 'utf-8')) as PumpModel;
      if (Array.isArray(raw.weights) && typeof raw.bias === 'number' && typeof raw.dim === 'number') {
        model = raw;
        return;
      }
    }
  } catch {}
  model = null;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2).slice(0, 200);
}

function featurize(text: string, dim = 512): number[] {
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

export function scoreText(text: string): number {
  ensureModel();
  const fallback = 0.5;
  if (!model) {
    // Heuristic fallback: keywords boost
    const s = text.toLowerCase();
    const hype = /(pump|100x|moon|rocket|lambo|airdrop|instant)/.test(s) ? 0.7 : 0.4;
    return hype;
  }
  const x = featurize(text, model.dim);
  let z = model.bias;
  for (let i = 0; i < model.dim && i < model.weights.length; i += 1) z += model.weights[i] * x[i];
  const p = 1 / (1 + Math.exp(-z));
  return Number.isFinite(p) ? p : fallback;
}

