import {
  appendTopicMatchParquet,
  appendTopicParquet,
  appendTopicWindowParquet,
  recordTopicMatch,
  removeTopicWindow,
  storeTokenCandidate,
  storeTopicEvent,
  upsertTopicCluster,
  upsertTopicWindow
} from '@trenches/persistence';
import { TokenCandidate, TopicEvent } from '@trenches/shared';
import { TopicWindowRecord, TopicClusterRecord } from '@trenches/persistence';

export interface NarrativePersistence {
  recordTopic(event: TopicEvent): Promise<void> | void;
  recordCluster(cluster: TopicClusterRecord): Promise<void> | void;
  recordWindow(window: TopicWindowRecord): Promise<void> | void;
  removeWindow(windowId: string): Promise<void> | void;
  recordMatch(match: {
    id: string;
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
  }): Promise<void> | void;
  storeCandidate(candidate: TokenCandidate): Promise<void> | void;
}

export class DefaultNarrativePersistence implements NarrativePersistence {
  async recordTopic(event: TopicEvent): Promise<void> {
    storeTopicEvent(event);
    await appendTopicParquet({
      topicId: event.topicId,
      label: event.label,
      sss: event.sss,
      decayedSss: event.decayedSss ?? event.sss,
      novelty: event.novelty,
      windowSec: event.windowSec,
      sources: event.sources,
      phrases: event.cluster?.phrases ?? [],
      addedPhrases: event.cluster?.addedPhrases ?? [],
      centroid: event.cluster?.centroid ?? [],
      createdAt: new Date().toISOString()
    });
  }

  async recordCluster(cluster: TopicClusterRecord): Promise<void> {
    upsertTopicCluster(cluster);
  }

  async recordWindow(window: TopicWindowRecord): Promise<void> {
    upsertTopicWindow(window);
    await appendTopicWindowParquet(window);
  }

  async removeWindow(windowId: string): Promise<void> {
    removeTopicWindow(windowId);
  }

  async recordMatch(match: {
    id: string;
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
  }): Promise<void> {
    recordTopicMatch(match);
    await appendTopicMatchParquet({
      topicId: match.topicId,
      mint: match.mint,
      matchScore: match.matchScore,
      matchedAt: match.matchedAt,
      source: match.source
    });
  }

  async storeCandidate(candidate: TokenCandidate): Promise<void> {
    storeTokenCandidate(candidate);
  }
}

export class InMemoryNarrativePersistence implements NarrativePersistence {
  public topics: TopicEvent[] = [];
  public clusters: TopicClusterRecord[] = [];
  public windows: TopicWindowRecord[] = [];
  public matches: Array<{
    id: string;
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
  }> = [];
  public candidates: TokenCandidate[] = [];

  async recordTopic(event: TopicEvent): Promise<void> {
    this.topics.push(event);
  }

  async recordCluster(cluster: TopicClusterRecord): Promise<void> {
    const existingIndex = this.clusters.findIndex((item) => item.topicId === cluster.topicId);
    if (existingIndex >= 0) {
      this.clusters[existingIndex] = cluster;
    } else {
      this.clusters.push(cluster);
    }
  }

  async recordWindow(window: TopicWindowRecord): Promise<void> {
    const idx = this.windows.findIndex((item) => item.windowId === window.windowId);
    if (idx >= 0) {
      this.windows[idx] = window;
    } else {
      this.windows.push(window);
    }
  }

  async removeWindow(windowId: string): Promise<void> {
    this.windows = this.windows.filter((window) => window.windowId !== windowId);
  }

  async recordMatch(match: {
    id: string;
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
  }): Promise<void> {
    this.matches.push(match);
  }

  async storeCandidate(candidate: TokenCandidate): Promise<void> {
    this.candidates.push(candidate);
  }
}

