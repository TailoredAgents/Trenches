import { LRUCache } from 'lru-cache';
import { TokenCandidate } from '@trenches/shared';
import { TopicWindowRecord } from '@trenches/persistence';
import { cosineSimilarity, vectorizeText } from './embedding';

export interface MatchingConfig {
  minTrieScore: number;
  minCosine: number;
  boostSymbolMatch: number;
  coolDownSec: number;
}

export interface MatcherOptions {
  vectorizer?: (text: string) => Float32Array;
}

interface ClusterDescriptor {
  topicId: string;
  label: string;
  centroid: Float32Array;
  phrases: Set<string>;
}

interface MatchResult {
  topicId: string;
  score: number;
  cosine: number;
  trie: number;
}

export class Matcher {
  private readonly config: MatchingConfig;
  private readonly vectorizer: (text: string) => Float32Array;
  private readonly clusters = new Map<string, ClusterDescriptor>();
  private readonly phraseToTopics = new Map<string, Set<string>>();
  private readonly vectorCache = new LRUCache<string, Float32Array>({ max: 256 });
  private readonly cooldown = new Map<string, number>();
  private automaton: AhoCorasick | null = null;
  private automatonDirty = true;

  constructor(config: MatchingConfig, options?: MatcherOptions) {
    this.config = config;
    this.vectorizer = options?.vectorizer ?? vectorizeText;
  }

  setCluster(descriptor: { topicId: string; label: string; centroid: Float32Array; phrases: string[] }): void {
    this.clusters.set(descriptor.topicId, {
      topicId: descriptor.topicId,
      label: descriptor.label,
      centroid: descriptor.centroid,
      phrases: new Set(descriptor.phrases)
    });
    for (const phrase of descriptor.phrases) {
      const key = phrase.toLowerCase();
      let bucket = this.phraseToTopics.get(key);
      if (!bucket) {
        bucket = new Set();
        this.phraseToTopics.set(key, bucket);
      }
      bucket.add(descriptor.topicId);
    }
    this.automatonDirty = true;
  }

  removeCluster(topicId: string): void {
    const descriptor = this.clusters.get(topicId);
    if (!descriptor) return;
    for (const phrase of descriptor.phrases) {
      const key = phrase.toLowerCase();
      const bucket = this.phraseToTopics.get(key);
      if (!bucket) continue;
      bucket.delete(topicId);
      if (bucket.size === 0) {
        this.phraseToTopics.delete(key);
      }
    }
    this.clusters.delete(topicId);
    this.automatonDirty = true;
  }

  matchCandidate(
    candidate: TokenCandidate,
    windows: TopicWindowRecord[],
    now: number
  ): MatchResult | null {
    if (this.config.coolDownSec > 0) {
      const last = this.cooldown.get(candidate.mint);
      if (last && now - last < this.config.coolDownSec * 1000) {
        return null;
      }
    }
    const activeTopics = new Set<string>(windows.map((window) => window.topicId));
    if (activeTopics.size === 0) {
      return null;
    }
    const textKey = buildTextKey(candidate);
    const vector = this.getVector(textKey);
    const automaton = this.getAutomaton();
    const name = (candidate.name ?? '').toLowerCase();
    const symbol = (candidate.symbol ?? '').toLowerCase();
    const searchText = `${name} ${symbol}`.trim();
    const trieScores = automaton.search(searchText);

    let best: MatchResult | null = null;
    for (const topicId of activeTopics) {
      const cluster = this.clusters.get(topicId);
      if (!cluster) {
        continue;
      }
      const cosine = cosineSimilarity(cluster.centroid, vector);
      const trie = trieScores.get(topicId) ?? 0;
      const normalizedTrie = Math.min(1, trie);
      const symbolBoost = symbol && cluster.phrases.has(symbol) ? this.config.boostSymbolMatch : 0;
      if (cosine < this.config.minCosine && normalizedTrie < this.config.minTrieScore) {
        continue;
      }
      let score = 0.65 * cosine + 0.3 * normalizedTrie + symbolBoost;
      if (name && cluster.label.toLowerCase() === name) {
        score += 0.05;
      }
      score = Math.min(1, score);
      if (!best || score > best.score) {
        best = { topicId, score, cosine, trie: normalizedTrie };
      }
    }
    if (best) {
      this.cooldown.set(candidate.mint, now);
    }
    return best;
  }

  private getVector(key: string): Float32Array {
    const cached = this.vectorCache.get(key);
    if (cached) {
      return cached;
    }
    const vector = this.vectorizer(key);
    this.vectorCache.set(key, vector);
    return vector;
  }

  private getAutomaton(): AhoCorasick {
    if (!this.automatonDirty && this.automaton) {
      return this.automaton;
    }
    const entries: Array<{ phrase: string; topicIds: Set<string> }> = [];
    for (const [phrase, topicIds] of this.phraseToTopics.entries()) {
      entries.push({ phrase, topicIds });
    }
    this.automaton = new AhoCorasick(entries);
    this.automatonDirty = false;
    return this.automaton;
  }
}

class AhoNode {
  children = new Map<string, AhoNode>();
  fail: AhoNode | null = null;
  outputs: Array<{ topicId: string; weight: number }> = [];
}

class AhoCorasick {
  private readonly root = new AhoNode();

  constructor(entries: Array<{ phrase: string; topicIds: Set<string> }>) {
    for (const entry of entries) {
      this.insert(entry.phrase, entry.topicIds);
    }
    this.build();
  }

  search(text: string): Map<string, number> {
    const results = new Map<string, number>();
    let node = this.root;
    const lower = text.toLowerCase();
    for (let i = 0; i < lower.length; i += 1) {
      const ch = lower[i];
      if (!isAlphaNumeric(ch)) {
        continue;
      }
      while (node && !node.children.has(ch)) {
        node = node.fail ?? this.root;
      }
      node = node.children.get(ch) ?? this.root;
      for (const output of node.outputs) {
        const bucket = results.get(output.topicId) ?? 0;
        results.set(output.topicId, bucket + output.weight);
      }
    }
    return results;
  }

  private insert(phrase: string, topicIds: Set<string>): void {
    let node = this.root;
    const normalized = phrase.toLowerCase();
    for (const ch of normalized) {
      if (!isAlphaNumeric(ch)) {
        continue;
      }
      if (!node.children.has(ch)) {
        node.children.set(ch, new AhoNode());
      }
      node = node.children.get(ch)!;
    }
    const weight = Math.max(0.1, Math.min(1, phrase.length / 12));
    for (const topicId of topicIds) {
      node.outputs.push({ topicId, weight });
    }
  }

  private build(): void {
    const queue: AhoNode[] = [];
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const [ch, child] of node.children.entries()) {
        let fallback = node.fail;
        while (fallback && !fallback.children.has(ch)) {
          fallback = fallback.fail;
        }
        child.fail = fallback ? fallback.children.get(ch) ?? this.root : this.root;
        child.outputs = child.outputs.concat(child.fail.outputs);
        queue.push(child);
      }
    }
  }
}

function isAlphaNumeric(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
}

function buildTextKey(candidate: TokenCandidate): string {
  const name = candidate.name ? candidate.name.toLowerCase() : '';
  const symbol = candidate.symbol ? candidate.symbol.toLowerCase() : '';
  return `${name}|${symbol}`;
}







