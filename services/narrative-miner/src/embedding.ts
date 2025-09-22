const EMBEDDING_DIM = 256;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function getEmbeddingDim(): number {
  return EMBEDDING_DIM;
}

export function vectorizeText(input: string): Float32Array {
  const vec = new Float32Array(EMBEDDING_DIM);
  const normalized = normalizeText(input);
  if (!normalized) {
    return vec;
  }
  const tokens = normalized.split(' ');
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    addFeature(vec, token, 0, 1);
    addFeature(vec, token.slice(0, 4), 1, 0.75);
    if (token.length >= 3) {
      for (let j = 0; j <= token.length - 3; j += 1) {
        const tri = token.slice(j, j + 3);
        addFeature(vec, tri, 2, 0.6);
      }
    }
    if (i < tokens.length - 1) {
      const bigram = `${token}_${tokens[i + 1]}`;
      addFeature(vec, bigram, 3, 0.9);
    }
  }
  normalizeVector(vec);
  return vec;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / Math.sqrt(normA * normB);
}

export function blendVectors(current: Float32Array, incoming: Float32Array, weight: number): Float32Array {
  const result = new Float32Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i += 1) {
    result[i] = current[i] * weight + incoming[i];
  }
  normalizeVector(result);
  return result;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVector(vec: Float32Array): void {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) {
    norm += vec[i] * vec[i];
  }
  if (norm === 0) {
    return;
  }
  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < vec.length; i += 1) {
    vec[i] *= scale;
  }
}

function addFeature(vec: Float32Array, key: string, seed: number, weight: number): void {
  const index = hashWithSeed(key, seed) % EMBEDDING_DIM;
  vec[index] += weight;
}

function hashWithSeed(value: string, seed: number): number {
  let hash = FNV_OFFSET ^ seed;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
