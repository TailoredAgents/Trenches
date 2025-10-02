#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

type Sample = { text: string; label: 0 | 1 };

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

function sigmoid(z: number): number { return 1 / (1 + Math.exp(-z)); }

async function main(): Promise<void> {
  const dataPath = process.argv[2] || 'data/pump_labels.jsonl';
  const outPath = process.argv[3] || 'models/pump_classifier_v1.json';
  if (!fs.existsSync(dataPath)) {
    console.error('training data not found at', dataPath);
    process.exit(1);
  }
  const lines = fs.readFileSync(dataPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  const samples: Sample[] = lines.map((ln) => { try { const j = JSON.parse(ln) as Sample; return j; } catch { return { text: ln, label: 0 }; } });
  const dim = 512;
  let w = new Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.01);
  let b = 0;
  const lr = 0.1; const epochs = 10;
  const xs = samples.map((s) => featurize(s.text, dim));
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let loss = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const x = xs[i]; const y = samples[i].label;
      let z = b; for (let k = 0; k < dim; k += 1) z += w[k] * x[k];
      const p = sigmoid(z);
      loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      const grad = p - y;
      for (let k = 0; k < dim; k += 1) w[k] -= lr * grad * x[k];
      b -= lr * grad;
    }
    loss /= samples.length;
    if (epoch % 2 === 0) console.log('epoch', epoch, 'loss', loss.toFixed(4));
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ dim, weights: w, bias: b }));
  console.log('saved model to', outPath);
}

void main();

