#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

type Sample = { text: string; label: 0 | 1 };

type EmbedBatch = (texts: string[]) => Promise<number[][]>;

type TrainingResult = {
  trained: boolean;
  samples: number;
  embedder: { name: string; fallback: boolean; dim: number };
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 200);
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

async function createEmbedder(modelName: string | undefined): Promise<{ name: string; fallback: boolean; dim: number; embed: EmbedBatch }> {
  try {
    if (modelName) {
      const transformers = await import('@xenova/transformers');
      if (typeof transformers.pipeline === 'function') {
        const extractor: any = await transformers.pipeline('feature-extraction', modelName, { quantized: true });
        return {
          name: modelName,
          fallback: false,
          dim: 0,
          embed: async (texts: string[]) => {
            const arrs: number[][] = [];
            for (const text of texts) {
              try {
                const output: any = await extractor(text, { pooling: 'mean', normalize: true });
                if (Array.isArray(output)) {
                  const vec = Array.isArray(output[0]) ? output[0] : output;
                  arrs.push(vec.map((x: number) => Number(x)));
                } else if (Array.isArray(output.data)) {
                  arrs.push(output.data.map((x: number) => Number(x)));
                } else {
                  arrs.push(hashEmbed(text));
                }
              } catch {
                arrs.push(hashEmbed(text));
              }
            }
            if (arrs.length > 0) {
              const dim = arrs[0].length;
              for (const vec of arrs) {
                if (vec.length !== dim) {
                  vec.length = dim;
                }
              }
            }
            return arrs;
          }
        };
      }
    }
  } catch {
    // fallback below
  }
  const dim = 512;
  return {
    name: 'hash-512',
    fallback: true,
    dim,
    embed: async (texts: string[]) => texts.map((text) => hashEmbed(text, dim))
  };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export async function trainPumpClassifier(options?: { dataPath?: string; outPath?: string; modelName?: string }): Promise<TrainingResult> {
  const dataPath = options?.dataPath ?? 'data/pump_labels.jsonl';
  const outPath = options?.outPath ?? 'models/pump_classifier_v1.json';
  if (!fs.existsSync(dataPath)) {
    console.log(`skipped: no dataset at ${dataPath}`);
    return {
      trained: false,
      samples: 0,
      embedder: { name: 'none', fallback: true, dim: 0 }
    };
  }
  const lines = fs.readFileSync(dataPath, 'utf-8').split(/\r?\n/).filter(Boolean);
  const samples: Sample[] = lines
    .map((ln) => {
      try {
        const parsed = JSON.parse(ln) as Sample;
        return parsed;
      } catch {
        return { text: ln, label: 0 };
      }
    })
    .filter((s) => typeof s.text === 'string' && (s.label === 0 || s.label === 1));
  if (samples.length === 0) {
    console.log('skipped: dataset empty');
    return {
      trained: false,
      samples: 0,
      embedder: { name: 'none', fallback: true, dim: 0 }
    };
  }

  const embedder = await createEmbedder(options?.modelName ?? 'bge-small-en');
  const embeddings = await embedder.embed(samples.map((s) => s.text));
  const dim = embeddings[0]?.length ?? embedder.dim ?? 512;
  const xs = embeddings.map((vec) => {
    if (!vec || vec.length !== dim) {
      return hashEmbed(samples[0].text, dim);
    }
    return vec;
  });

  let weights = new Array(dim).fill(0).map(() => (Math.random() - 0.5) * 0.01);
  let bias = 0;
  const lr = 0.05;
  const epochs = Math.min(20, Math.max(5, Math.floor(2000 / samples.length)));

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    let loss = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const x = xs[i];
      const y = samples[i].label;
      let z = bias;
      for (let k = 0; k < dim; k += 1) z += weights[k] * x[k];
      const p = sigmoid(z);
      loss += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
      const grad = p - y;
      for (let k = 0; k < dim; k += 1) weights[k] -= lr * grad * x[k];
      bias -= lr * grad;
    }
    loss /= samples.length;
    if (epoch % 5 === 0 || epoch === epochs - 1) {
      console.log(`epoch ${epoch} loss ${loss.toFixed(4)}`);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const model = {
    dim,
    weights,
    bias,
    embedder: { type: embedder.fallback ? 'hash' : 'xenova', name: embedder.name, dim }
  };
  fs.writeFileSync(outPath, JSON.stringify(model));
  console.log(`saved model to ${outPath}`);
  return {
    trained: true,
    samples: samples.length,
    embedder: { name: embedder.name, fallback: embedder.fallback, dim }
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  const dataPath = process.argv[2];
  const outPath = process.argv[3];
  trainPumpClassifier({ dataPath, outPath })
    .then((res) => {
      if (!res.trained) {
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
