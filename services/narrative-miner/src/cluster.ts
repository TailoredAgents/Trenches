import crypto from 'crypto';
import { TopicClusterRecord } from '@trenches/persistence';
import { ExtractedPhrase } from './phraseExtractor';
import { PhraseObservation } from './phraseTracker';
import { BaselineSnapshot } from './baseline';
import { blendVectors, cosineSimilarity, getEmbeddingDim, vectorizeText } from './embedding';

export interface ClusterConfig {
  lshBands: number;
  lshRows: number;
  minCosine: number;
  mergeMinObservations: number;
}

export interface ScoringConfig {
  openThreshold: number;
  sustainThreshold: number;
  recencyHalfLifeSec: number;
  noveltyEpsilon: number;
}

export interface GatingConfig {
  uniquesMin: number;
}

export interface ClusterManagerOptions {
  vectorizer?: (phrase: string) => Float32Array;
  lshSeed?: number;
}

export interface ClusterUpdate {
  topicId: string;
  label: string;
  sss: number;
  decayedSss: number;
  novelty: number;
  sources: string[];
  addedPhrases: string[];
  windowSeconds: number;
}

interface Cluster {
  id: string;
  label: string;
  centroid: Float32Array;
  phrases: Set<string>;
  observations: number;
  lastUpdated: number;
  sss: number;
  novelty: number;
  sources: Map<string, number>;
}

const SOURCE_RETENTION_MS = 20 * 60 * 1000;
export class ClusterManager {
  private readonly clusters = new Map<string, Cluster>();
  private readonly phraseToCluster = new Map<string, string>();
  private readonly index: LshIndex;
  private readonly config: ClusterConfig;
  private readonly scoring: ScoringConfig;
  private readonly gating: GatingConfig;
  private readonly vectorizer: (phrase: string) => Float32Array;
  private readonly recencyHalfLifeMs: number;
  private readonly baselineWindowMinutes: number;
  private readonly windowDurationSec: number;

  constructor(
    clusterConfig: ClusterConfig,
    scoring: ScoringConfig,
    gating: GatingConfig,
    baselineHalfLifeSec: number,
    windowDurationSec: number,
    options?: ClusterManagerOptions
  ) {
    this.config = clusterConfig;
    this.scoring = scoring;
    this.gating = gating;
    this.vectorizer = options?.vectorizer ?? vectorizeText;
    this.recencyHalfLifeMs = scoring.recencyHalfLifeSec * 1000;
    this.baselineWindowMinutes = Math.max(1, baselineHalfLifeSec / 60);
    const seed = options?.lshSeed ?? 1337;
    this.index = new LshIndex(getEmbeddingDim(), clusterConfig.lshBands, clusterConfig.lshRows, seed);
    this.windowDurationSec = windowDurationSec;
  }

  bootstrap(records: TopicClusterRecord[], now: number): void {
    for (const record of records) {
      const centroid = new Float32Array(getEmbeddingDim());
      const sourceCentroid = record.centroid ?? [];
      for (let i = 0; i < Math.min(sourceCentroid.length, centroid.length); i += 1) {
        centroid[i] = sourceCentroid[i];
      }
      const cluster: Cluster = {
        id: record.topicId,
        label: record.label,
        centroid,
        phrases: new Set(record.phrases ?? []),
        observations: Math.max(1, record.phrases?.length ?? 1),
        lastUpdated: now,
        sss: record.sss ?? 0,
        novelty: record.novelty ?? 0,
        sources: new Map()
      };
      this.clusters.set(cluster.id, cluster);
      for (const phrase of cluster.phrases) {
        this.phraseToCluster.set(phrase, cluster.id);
      }
      this.index.add(cluster.id, cluster.centroid);
    }
  }

  getCluster(topicId: string): Cluster | undefined {
    return this.clusters.get(topicId);
  }

  describeCluster(topicId: string, now: number): ClusterUpdate | undefined {
    const cluster = this.clusters.get(topicId);
    if (!cluster) return undefined;
    const decayed = this.applyRecencyDecay(cluster.sss, cluster.lastUpdated, now);
    return {
      topicId: cluster.id,
      label: cluster.label,
      sss: cluster.sss,
      decayedSss: decayed,
      novelty: cluster.novelty,
      sources: this.collectSources(cluster, now),
      addedPhrases: Array.from(cluster.phrases),
      windowSeconds: this.windowDurationSec
    };
  }

  observe(
    phrase: ExtractedPhrase,
    observation: PhraseObservation,
    baseline: BaselineSnapshot,
    metadata: { platform: string; now: number }
  ): ClusterUpdate {
    const vector = this.vectorizer(phrase.key);
    if (!hasMagnitude(vector)) {
      throw new Error(`Unable to vectorize phrase: ${phrase.key}`);
    }
    let cluster = this.resolveCluster(phrase.key, vector);
    const addedPhrases: string[] = [];
    if (!cluster) {
      cluster = this.createCluster(phrase, vector, metadata.now);
      addedPhrases.push(phrase.key);
    } else {
      if (!cluster.phrases.has(phrase.key)) {
        cluster.phrases.add(phrase.key);
        addedPhrases.push(phrase.key);
      }
      cluster.observations += 1;
      cluster.centroid = blendVectors(cluster.centroid, vector, Math.min(cluster.observations, this.config.mergeMinObservations));
      this.index.update(cluster.id, cluster.centroid);
    }
    this.phraseToCluster.set(phrase.key, cluster.id);
    cluster.sources.set(metadata.platform, metadata.now);

    const sss = this.computeSss(observation, baseline);
    cluster.sss = sss;
    cluster.novelty = this.computeNovelty(observation, baseline);
    cluster.lastUpdated = metadata.now;

    const decayedSss = this.applyRecencyDecay(sss, cluster.lastUpdated, metadata.now);
    const sources = this.collectSources(cluster, metadata.now);

    return {
      topicId: cluster.id,
      label: cluster.label,
      sss,
      decayedSss,
      novelty: cluster.novelty,
      sources,
      addedPhrases,
      windowSeconds: this.windowDurationSec
    };
  }

  private collectSources(cluster: Cluster, now: number): string[] {
    const cutoff = now - SOURCE_RETENTION_MS;
    const sources: string[] = [];
    for (const [source, timestamp] of cluster.sources.entries()) {
      if (timestamp >= cutoff) {
        sources.push(source);
      }
    }
    return sources.sort();
  }

  private resolveCluster(phrase: string, vector: Float32Array): Cluster | undefined {
    const existingId = this.phraseToCluster.get(phrase);
    if (existingId) {
      return this.clusters.get(existingId);
    }
    const candidates = this.index.query(vector);
    let best: { cluster: Cluster; cosine: number } | undefined;
    for (const candidateId of candidates) {
      const candidate = this.clusters.get(candidateId);
      if (!candidate) continue;
      const cosine = cosineSimilarity(candidate.centroid, vector);
      if (!best || cosine > best.cosine) {
        best = { cluster: candidate, cosine };
      }
    }
    if (best && best.cosine >= this.config.minCosine) {
      return best.cluster;
    }
    return undefined;
  }

  private createCluster(phrase: ExtractedPhrase, vector: Float32Array, now: number): Cluster {
    const id = crypto.randomUUID();
    const cluster: Cluster = {
      id,
      label: phrase.label,
      centroid: vector,
      phrases: new Set([phrase.key]),
      observations: 1,
      lastUpdated: now,
      sss: 0,
      novelty: 0,
      sources: new Map()
    };
    this.clusters.set(id, cluster);
    this.index.add(id, vector);
    return cluster;
  }

  getClusterCount(): number {
    return this.clusters.size;
  }

  listClusterDescriptors(): Array<{ topicId: string; label: string; centroid: Float32Array; phrases: string[] }> {
    const descriptors: Array<{ topicId: string; label: string; centroid: Float32Array; phrases: string[] }> = [];
    for (const cluster of this.clusters.values()) {
      descriptors.push({
        topicId: cluster.id,
        label: cluster.label,
        centroid: cluster.centroid,
        phrases: Array.from(cluster.phrases)
      });
    }
    return descriptors;
  }

  getClusterDescriptor(topicId: string): { topicId: string; label: string; centroid: Float32Array; phrases: string[] } | undefined {
    const cluster = this.clusters.get(topicId);
    if (!cluster) return undefined;
    return {
      topicId: cluster.id,
      label: cluster.label,
      centroid: cluster.centroid,
      phrases: Array.from(cluster.phrases)
    };
  }

  private computeSss(observation: PhraseObservation, baseline: BaselineSnapshot): number {
    const zNorm = sigmoid(observation.zScore / 2);
    const uniqueTarget = Math.max(4, this.gating.uniquesMin);
    const uniqueScore = clamp01(observation.uniqueAuthors / uniqueTarget);
    const volumeScore = clamp01(observation.postsPerMinute / Math.max(4, uniqueTarget));
    const reachBaseline = baseline.authors / this.baselineWindowMinutes;
    const reachScore = clamp01(observation.uniqueAuthors / (reachBaseline * 1.5 + 1));
    const noveltyScore = this.computeNovelty(observation, baseline);
    const sss = 0.35 * zNorm + 0.25 * uniqueScore + 0.2 * volumeScore + 0.2 * noveltyScore;
    return clamp01(sss);
  }

  private computeNovelty(observation: PhraseObservation, baseline: BaselineSnapshot): number {
    const epsilon = this.scoring.noveltyEpsilon;
    const observedRate = observation.postsPerMinute + epsilon;
    const baselineRate = baseline.count / this.baselineWindowMinutes + epsilon;
    const ratio = Math.log(observedRate / baselineRate);
    const score = 0.5 + 0.5 * Math.tanh(ratio);
    return clamp01(score);
  }

  private applyRecencyDecay(value: number, updatedAt: number, now: number): number {
    const elapsed = now - updatedAt;
    if (elapsed <= 0) {
      return value;
    }
    const decay = Math.pow(0.5, elapsed / this.recencyHalfLifeMs);
    return value * decay;
  }
}

class LshIndex {
  private readonly dim: number;
  private readonly bands: number;
  private readonly rows: number;
  private readonly seed: number;
  private readonly hyperplanes: Float32Array[][];
  private readonly buckets = new Map<string, Set<string>>();
  private readonly signatures = new Map<string, string[]>();

  constructor(dim: number, bands: number, rows: number, seed: number) {
    this.dim = dim;
    this.bands = Math.max(1, bands);
    this.rows = Math.max(1, rows);
    this.seed = seed;
    this.hyperplanes = this.buildHyperplanes();
  }

  add(id: string, vector: Float32Array): void {
    const signature = this.computeSignature(vector);
    this.signatures.set(id, signature);
    for (const key of signature) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set();
        this.buckets.set(key, bucket);
      }
      bucket.add(id);
    }
  }

  update(id: string, vector: Float32Array): void {
    this.remove(id);
    this.add(id, vector);
  }

  remove(id: string): void {
    const signature = this.signatures.get(id);
    if (!signature) {
      return;
    }
    for (const key of signature) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) {
        this.buckets.delete(key);
      }
    }
    this.signatures.delete(id);
  }

  query(vector: Float32Array): Set<string> {
    const signature = this.computeSignature(vector);
    const candidates = new Set<string>();
    for (const key of signature) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      for (const id of bucket) {
        candidates.add(id);
      }
    }
    return candidates;
  }

  private computeSignature(vector: Float32Array): string[] {
    const result: string[] = [];
    for (let band = 0; band < this.bands; band += 1) {
      let signature = 0;
      for (let row = 0; row < this.rows; row += 1) {
        const plane = this.hyperplanes[band][row];
        const dot = dotProduct(plane, vector);
        signature = (signature << 1) | (dot >= 0 ? 1 : 0);
      }
      result.push(`${band}:${signature.toString(16)}`);
    }
    return result;
  }

  private buildHyperplanes(): Float32Array[][] {
    const planes: Float32Array[][] = [];
    const rng = createRandom(this.seed);
    for (let band = 0; band < this.bands; band += 1) {
      const bandPlanes: Float32Array[] = [];
      for (let row = 0; row < this.rows; row += 1) {
        const plane = new Float32Array(this.dim);
        for (let i = 0; i < this.dim; i += 1) {
          plane[i] = rng() * 2 - 1;
        }
        bandPlanes.push(plane);
      }
      planes.push(bandPlanes);
    }
    return planes;
  }
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function hasMagnitude(vec: Float32Array): boolean {
  for (let i = 0; i < vec.length; i += 1) {
    if (vec[i] !== 0) return true;
  }
  return false;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}










