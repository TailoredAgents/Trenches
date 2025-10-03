import { describe, expect, test } from 'vitest';
import { ClusterManager } from '../cluster';
import { WatchWindowManager } from '../watchWindows';
import { Matcher } from '../matcher';
import { InMemoryNarrativePersistence } from '../persistence';
import { TokenCandidate, TopicEvent } from '@trenches/shared';
import type { TopicClusterRecord, TopicWindowRecord } from '@trenches/persistence';

const VECTOR_DIM = 4;
const baseVectors: Record<string, number[]> = {
  djt: [1, 0, 0, 0],
  maga: [0.95, 0.05, 0, 0],
  patriot: [0.9, 0.05, 0, 0.05],
  default: [0, 0, 0, 1]
};

const testVectorizer = (phrase: string): Float32Array => {
  const tokens = phrase
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, ' ')
    .replace(/[|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const accum = new Float32Array(VECTOR_DIM);
  if (tokens.length === 0) {
    accum[accum.length - 1] = 1;
    return accum;
  }
  for (const token of tokens) {
    const source = baseVectors[token] ?? baseVectors.default;
    for (let i = 0; i < VECTOR_DIM; i += 1) {
      accum[i] += source[i];
    }
  }
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i += 1) {
    norm += accum[i] * accum[i];
  }
  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm);
    for (let i = 0; i < VECTOR_DIM; i += 1) {
      accum[i] *= scale;
    }
  }
  return accum;
};

const clusterConfig = { lshBands: 4, lshRows: 4, minCosine: 0.1, mergeMinObservations: 3 } as const;
const scoringConfig = { openThreshold: 0.6, sustainThreshold: 0.45, recencyHalfLifeSec: 120, noveltyEpsilon: 1e-6 } as const;
const gatingConfig = { uniquesMin: 12 } as const;

const baselineSnapshot = {
  phrase: 'djt',
  count: 0,
  engagement: 0,
  authors: 0
};

describe('ClusterManager', () => {
  test('creates clusters and updates phrase sets', () => {
    const manager = new ClusterManager(clusterConfig, scoringConfig, gatingConfig, 600, 1200, {
      vectorizer: testVectorizer,
      lshSeed: 7
    });
    const now = Date.now();

    const first = manager.observe(
      { key: 'djt', label: 'DJT' },
      {
        phrase: 'djt',
        timestamp: now,
        postsPerMinute: 8,
        uniqueAuthors: 15,
        averageEngagement: 22,
        zScore: 3,
        recencySeconds: 0
      },
      baselineSnapshot,
      { platform: 'farcaster', now }
    );

    expect(first.topicId).toBeDefined();
    expect(first.addedPhrases).toEqual(['djt']);

    const second = manager.observe(
      { key: 'maga', label: 'MAGA' },
      {
        phrase: 'maga',
        timestamp: now + 1_000,
        postsPerMinute: 10,
        uniqueAuthors: 20,
        averageEngagement: 28,
        zScore: 2.5,
        recencySeconds: 1
      },
      baselineSnapshot,
      { platform: 'farcaster', now: now + 1_000 }
    );

    expect(second.addedPhrases).toContain('maga');

    if (second.topicId === first.topicId) {
      const merged = manager.getClusterDescriptor(first.topicId);
      expect(merged?.phrases).toEqual(expect.arrayContaining(['djt', 'maga']));
    } else {
      const original = manager.getClusterDescriptor(first.topicId);
      const newCluster = manager.getClusterDescriptor(second.topicId);
      expect(original?.phrases).toEqual(expect.arrayContaining(['djt']));
      expect(newCluster?.phrases).toEqual(expect.arrayContaining(['maga']));
    }
  });
});

describe('WatchWindowManager', () => {
  test('opens, refreshes, and closes watch windows', () => {
    const manager = new WatchWindowManager({
      durationSec: 60,
      refreshIntervalSec: 1,
      openThreshold: 0.6,
      sustainThreshold: 0.4
    });
    const now = Date.now();

    const open = manager.ingest({ topicId: 'topic-1', sss: 0.72, novelty: 0.8, windowSeconds: 60 }, now);
    expect(open).toHaveLength(1);
    expect(open[0].type).toBe('opened');

    const refresh = manager.ingest({ topicId: 'topic-1', sss: 0.8, novelty: 0.82, windowSeconds: 60 }, now + 5_000);
    expect(refresh).toHaveLength(1);
    expect(refresh[0].type).toBe('refreshed');

    const closed = manager.prune(now + 70_000);
    expect(closed).toHaveLength(1);
    expect(closed[0].type).toBe('closed');
    expect(manager.active(now + 70_000)).toHaveLength(0);
  });
});

describe('Matcher', () => {
  test('matches candidates using trie and cosine signals', () => {
    const matcher = new Matcher(
      { minTrieScore: 0.2, minCosine: 0.3, boostSymbolMatch: 0.1, coolDownSec: 0 },
      { vectorizer: testVectorizer }
    );
    const centroid = testVectorizer('djt maga patriot');
    matcher.setCluster({
      topicId: 'topic-1',
      label: 'DJT',
      centroid,
      phrases: ['djt', 'maga']
    });

    const candidate: TokenCandidate = {
      t: 'token_candidate',
      mint: 'mint123',
      name: 'DJT Patriot',
      symbol: 'DJT',
      source: 'raydium',
      ageSec: 10,
      lpSol: 40,
      buys60: 20,
      sells60: 5,
      uniques60: 18,
      spreadBps: 50,
      safety: { ok: true, reasons: [] },
      
    };

    const now = Date.now();
    const windows = [
      {
        windowId: 'topic-1',
        topicId: 'topic-1',
        openedAt: new Date(now - 5_000).toISOString(),
        expiresAt: new Date(now + 50_000).toISOString(),
        lastRefresh: new Date(now - 1_000).toISOString(),
        sss: 0.7,
        novelty: 0.8
      }
    ];

    const result = matcher.matchCandidate(candidate, windows, now);
    expect(result).not.toBeNull();
    expect(result?.topicId).toBe('topic-1');
    expect(result?.score ?? 0).toBeGreaterThan(0.4);
  });
});
describe('InMemoryNarrativePersistence', () => {
  test('captures records in memory', async () => {
    const persistence = new InMemoryNarrativePersistence();
    const topicEvent: TopicEvent = {
      t: 'topic_spike',
      topicId: 'topic-1',
      label: 'SampleTopic',
      sss: 0.74,
      decayedSss: 0.7,
      novelty: 0.6,
      windowSec: 120,
      sources: ['farcaster'],
      cluster: { phrases: ['djt'], addedPhrases: ['djt'], centroid: [0.1, 0.2, 0.3, 0.4] }
    };

    await persistence.recordTopic(topicEvent);
    await persistence.recordMatch({
      id: 'match-1',
      topicId: 'topic-1',
      mint: 'mint123',
      matchScore: 0.82,
      matchedAt: new Date().toISOString(),
      source: 'raydium'
    });

    const windowRecord: TopicWindowRecord = {
      windowId: 'window-1',
      topicId: 'topic-1',
      openedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastRefresh: new Date().toISOString(),
      sss: 0.74,
      novelty: 0.6
    };
    await persistence.recordWindow(windowRecord);

    const candidate: TokenCandidate = {
      t: 'token_candidate',
      mint: 'mint123',
      name: 'SampleToken',
      symbol: 'SAMP',
      source: 'raydium',
      ageSec: 15,
      lpSol: 30,
      buys60: 20,
      sells60: 5,
      uniques60: 18,
      spreadBps: 45,
      safety: { ok: true, reasons: [] },
      
    };
    await persistence.storeCandidate(candidate);

    const cluster: TopicClusterRecord = {
      topicId: 'topic-1',
      label: 'SampleTopic',
      centroid: [1, 0, 0, 0],
      phrases: ['sample'],
      sss: 0.74,
      novelty: 0.6,
      updatedAt: new Date().toISOString()
    };
    await persistence.recordCluster(cluster);

    await persistence.removeWindow('window-1');

    expect(persistence.topics).toHaveLength(1);
    expect(persistence.matches).toHaveLength(1);
    expect(persistence.candidates).toHaveLength(1);
    expect(persistence.windows).toHaveLength(0);
    expect(persistence.clusters[0]?.topicId).toBe('topic-1');
  });
});

