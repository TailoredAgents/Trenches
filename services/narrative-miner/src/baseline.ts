import { loadPhraseBaseline, upsertPhraseBaseline, PhraseBaselineRow } from '@trenches/persistence';

export interface BaselineSnapshot {
  phrase: string;
  count: number;
  engagement: number;
  authors: number;
}

interface BaselineEntry {
  count: number;
  engagement: number;
  authors: number;
  updatedAtMs: number;
}

export interface BaselineLogger {
  error(payload: unknown, message?: string): void;
}

export class BaselineManager {
  private readonly halfLifeMs: number;
  private readonly flushIntervalMs: number;
  private readonly entries = new Map<string, BaselineEntry>();
  private readonly dirty = new Set<string>();
  private readonly logger?: BaselineLogger;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushPromise: Promise<void> = Promise.resolve();

  constructor(halfLifeSec: number, flushIntervalSec: number, logger?: BaselineLogger) {
    this.halfLifeMs = halfLifeSec * 1000;
    this.flushIntervalMs = flushIntervalSec * 1000;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const rows = loadPhraseBaseline();
      for (const row of rows) {
        const updatedAtMs = row.updatedAt ? Date.parse(row.updatedAt) : Date.now();
        this.entries.set(row.phrase, {
          count: row.count,
          engagement: row.engagement,
          authors: row.authors,
          updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : Date.now()
        });
      }
    } catch (err) {
      this.logger?.error({ err }, 'baseline load failed; starting empty');
    }
  }

  start(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      this.flushPromise = this.flushPromise.then(() => this.flush()).catch((err) => {
        this.logger?.error({ err }, 'baseline flush error');
      });
    }, this.flushIntervalMs).unref();
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  snapshot(phrase: string, now: number): BaselineSnapshot {
    const entry = this.entries.get(phrase);
    if (!entry) {
      return { phrase, count: 0, engagement: 0, authors: 0 };
    }
    const decayed = this.applyDecay(entry, now, false);
    return { phrase, ...decayed };
  }

  applyObservation(
    phrase: string,
    delta: { count: number; engagement: number; authors: number },
    now: number
  ): BaselineSnapshot {
    const entry = this.entries.get(phrase) ?? {
      count: 0,
      engagement: 0,
      authors: 0,
      updatedAtMs: now
    };
    const decayed = this.applyDecay(entry, now, true);
    entry.count = decayed.count + delta.count;
    entry.engagement = decayed.engagement + delta.engagement;
    entry.authors = decayed.authors + delta.authors;
    entry.updatedAtMs = now;
    this.entries.set(phrase, entry);
    this.dirty.add(phrase);
    return { phrase, count: entry.count, engagement: entry.engagement, authors: entry.authors };
  }

  private applyDecay(entry: BaselineEntry, now: number, mutate: boolean): { count: number; engagement: number; authors: number } {
    const elapsed = Math.max(0, now - entry.updatedAtMs);
    if (elapsed === 0 || entry.count === 0) {
      return { count: entry.count, engagement: entry.engagement, authors: entry.authors };
    }
    const decay = Math.pow(0.5, elapsed / this.halfLifeMs);
    const count = entry.count * decay;
    const engagement = entry.engagement * decay;
    const authors = entry.authors * decay;
    if (mutate) {
      entry.count = count;
      entry.engagement = engagement;
      entry.authors = authors;
      entry.updatedAtMs = now;
    }
    return { count, engagement, authors };
  }

  private async flush(): Promise<void> {
    if (this.dirty.size === 0) {
      return;
    }
    const nowIso = new Date().toISOString();
    const rows: PhraseBaselineRow[] = [];
    for (const phrase of this.dirty) {
      const entry = this.entries.get(phrase);
      if (!entry) continue;
      rows.push({
        phrase,
        count: entry.count,
        engagement: entry.engagement,
        authors: entry.authors,
        updatedAt: new Date(entry.updatedAtMs).toISOString()
      });
    }
    this.dirty.clear();
    for (const row of rows) {
      try {
        upsertPhraseBaseline({ ...row, updatedAt: row.updatedAt ?? nowIso });
      } catch (err) {
        this.logger?.error({ err, phrase: row.phrase }, 'baseline flush failed');
      }
    }
  }
}
