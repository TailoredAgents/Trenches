import { TopicWindowRecord } from '@trenches/persistence';

export type WatchWindowEvent =
  | { type: 'opened' | 'refreshed'; window: TopicWindowRecord }
  | { type: 'closed'; window: TopicWindowRecord };

interface WatchWindowState {
  topicId: string;
  windowId: string;
  openedAt: number;
  expiresAt: number;
  lastRefresh: number;
  sss: number;
  novelty: number;
}

export interface WatchWindowConfig {
  durationSec: number;
  refreshIntervalSec: number;
  openThreshold: number;
  sustainThreshold: number;
}

export class WatchWindowManager {
  private readonly durationMs: number;
  private readonly refreshMs: number;
  private readonly openThreshold: number;
  private readonly sustainThreshold: number;
  private readonly windows = new Map<string, WatchWindowState>();

  constructor(config: WatchWindowConfig) {
    this.durationMs = config.durationSec * 1000;
    this.refreshMs = config.refreshIntervalSec * 1000;
    this.openThreshold = config.openThreshold;
    this.sustainThreshold = config.sustainThreshold;
  }

  bootstrap(records: TopicWindowRecord[]): void {
    for (const record of records) {
      const openedAt = Date.parse(record.openedAt);
      const expiresAt = Date.parse(record.expiresAt);
      const lastRefresh = Date.parse(record.lastRefresh);
      if (!Number.isFinite(openedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(lastRefresh)) {
        continue;
      }
      this.windows.set(record.topicId, {
        topicId: record.topicId,
        windowId: record.windowId,
        openedAt,
        expiresAt,
        lastRefresh,
        sss: record.sss,
        novelty: record.novelty
      });
    }
  }

  active(now: number): TopicWindowRecord[] {
    const results: TopicWindowRecord[] = [];
    for (const state of this.windows.values()) {
      if (state.expiresAt > now) {
        results.push(this.toRecord(state));
      }
    }
    return results;
  }

  getWindow(topicId: string, now: number): TopicWindowRecord | undefined {
    const state = this.windows.get(topicId);
    if (!state || state.expiresAt <= now) {
      return undefined;
    }
    return this.toRecord(state);
  }

  ingest(update: { topicId: string; sss: number; novelty: number; windowSeconds: number }, now: number): WatchWindowEvent[] {
    const events: WatchWindowEvent[] = [];
    const state = this.windows.get(update.topicId);
    const effectiveDurationMs = update.windowSeconds * 1000;
    if (update.sss >= this.openThreshold) {
      if (!state) {
        const created: WatchWindowState = {
          topicId: update.topicId,
          windowId: update.topicId,
          openedAt: now,
          expiresAt: now + effectiveDurationMs,
          lastRefresh: now,
          sss: update.sss,
          novelty: update.novelty
        };
        this.windows.set(update.topicId, created);
        events.push({ type: 'opened', window: this.toRecord(created) });
      } else {
        const shouldEmit = now - state.lastRefresh >= this.refreshMs || update.sss > state.sss;
        state.expiresAt = now + effectiveDurationMs;
        state.lastRefresh = now;
        state.sss = update.sss;
        state.novelty = update.novelty;
        if (shouldEmit) {
          events.push({ type: 'refreshed', window: this.toRecord(state) });
        }
      }
    } else if (state && update.sss < this.sustainThreshold) {
      // do not emit close immediately; allow prune to handle expiry
      state.sss = update.sss;
      state.novelty = update.novelty;
    }
    return events;
  }

  prune(now: number): WatchWindowEvent[] {
    const events: WatchWindowEvent[] = [];
    for (const [topicId, state] of this.windows.entries()) {
      if (state.expiresAt <= now) {
        this.windows.delete(topicId);
        events.push({ type: 'closed', window: this.toRecord(state) });
      }
    }
    return events;
  }

  private toRecord(state: WatchWindowState): TopicWindowRecord {
    return {
      windowId: state.windowId,
      topicId: state.topicId,
      openedAt: new Date(state.openedAt).toISOString(),
      expiresAt: new Date(state.expiresAt).toISOString(),
      lastRefresh: new Date(state.lastRefresh).toISOString(),
      sss: state.sss,
      novelty: state.novelty
    };
  }
}
