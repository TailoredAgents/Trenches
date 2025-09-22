export interface PhraseObservation {
  phrase: string;
  timestamp: number;
  postsPerMinute: number;
  uniqueAuthors: number;
  averageEngagement: number;
  zScore: number;
  recencySeconds: number;
}

interface PhraseEvent {
  timestamp: number;
  engagement: number;
  authorId: string;
}

interface PhraseState {
  events: PhraseEvent[];
  head: number;
  authorLastSeen: Map<string, number>;
  rollingEngagement: number;
  rollingPosts: number;
  totalCount: number;
  lastTimestamp: number;
}

const WINDOW_MS = 60_000;
const AUTHOR_TTL_MS = 60_000;

export class PhraseTracker {
  private readonly phrases = new Map<string, PhraseState>();
  private globalCount = 0;
  private globalMean = 0;
  private globalM2 = 0;

  observe(phrase: string, payload: { timestamp: number; authorId: string; engagement: number }): PhraseObservation {
    const state = this.ensureState(phrase);
    this.prune(state, payload.timestamp);

    const previousTimestamp = state.lastTimestamp;
    state.events.push({ timestamp: payload.timestamp, engagement: payload.engagement, authorId: payload.authorId });
    state.rollingEngagement += payload.engagement;
    state.rollingPosts += 1;
    state.totalCount += 1;
    state.lastTimestamp = payload.timestamp;

    this.updateGlobal(payload.engagement);

    state.authorLastSeen.set(payload.authorId, payload.timestamp);
    pruneAuthors(state.authorLastSeen, payload.timestamp);

    const postsPerMinute = state.rollingPosts;
    const averageEngagement = state.rollingPosts === 0 ? 0 : state.rollingEngagement / state.rollingPosts;
    const zScore = this.computeZScore(averageEngagement);
    const recencySeconds = previousTimestamp ? Math.max(0, (payload.timestamp - previousTimestamp) / 1000) : 0;

    return {
      phrase,
      timestamp: payload.timestamp,
      postsPerMinute,
      uniqueAuthors: state.authorLastSeen.size,
      averageEngagement,
      zScore,
      recencySeconds
    };
  }

  private ensureState(phrase: string): PhraseState {
    const existing = this.phrases.get(phrase);
    if (existing) {
      return existing;
    }
    const created: PhraseState = {
      events: [],
      head: 0,
      authorLastSeen: new Map(),
      rollingEngagement: 0,
      rollingPosts: 0,
      totalCount: 0,
      lastTimestamp: 0
    };
    this.phrases.set(phrase, created);
    return created;
  }

  private prune(state: PhraseState, now: number): void {
    const threshold = now - WINDOW_MS;
    while (state.head < state.events.length) {
      const event = state.events[state.head];
      if (event.timestamp >= threshold) {
        break;
      }
      state.rollingEngagement -= event.engagement;
      state.rollingPosts -= 1;
      state.head += 1;
    }
    if (state.head > 32 && state.head > state.events.length / 2) {
      state.events = state.events.slice(state.head);
      state.head = 0;
    }
  }

  private updateGlobal(engagement: number): void {
    this.globalCount += 1;
    const delta = engagement - this.globalMean;
    this.globalMean += delta / this.globalCount;
    const delta2 = engagement - this.globalMean;
    this.globalM2 += delta * delta2;
  }

  private computeZScore(value: number): number {
    if (this.globalCount < 2) {
      return 0;
    }
    const variance = this.globalM2 / (this.globalCount - 1);
    const std = Math.sqrt(Math.max(variance, 1e-6));
    return (value - this.globalMean) / std;
  }
}

function pruneAuthors(cache: Map<string, number>, now: number): void {
  const threshold = now - AUTHOR_TTL_MS;
  for (const [authorId, lastSeen] of cache.entries()) {
    if (lastSeen < threshold) {
      cache.delete(authorId);
    }
  }
}
