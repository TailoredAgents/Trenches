import { setTimeout as delay } from 'timers/promises';
import { SocialPost } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { storeSocialPost } from '@trenches/persistence';
import { SourceDependencies, SocialSource, SourceStatus } from '../types';
import { sourceEventsTotal, sourceErrorsTotal } from '../metrics';

const logger = createLogger('social:gdelt');

export type GdeltConfig = {
  enabled: boolean;
  pollIntervalSec: number;
};

export function createGdeltSource(
  config: GdeltConfig,
  deps: SourceDependencies,
  options: { baseUrl: string }
): SocialSource {
  return new GdeltSource(config, deps, options);
}

class GdeltSource implements SocialSource {
  readonly name = 'gdelt';
  private statusState: SourceStatus = { state: 'idle', detail: 'not started' };
  private stopped = false;
  private seen = new Set<string>();
  private readonly MAX_SEEN_SIZE = 10000; // Limit to 10k entries to prevent unbounded growth
  private errorBackoffMs = 1000; // Start with 1 second backoff
  private readonly MAX_BACKOFF_MS = 60000; // Max 1 minute backoff

  constructor(
    private readonly cfg: GdeltConfig,
    private readonly deps: SourceDependencies,
    private readonly options: { baseUrl: string }
  ) {}

  status(): SourceStatus {
    return this.statusState;
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.updateStatus({ state: 'idle', detail: 'disabled via config' });
      return;
    }
    this.stopped = false;
    this.updateStatus({ state: 'running', detail: 'starting poll loop' });
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.updateStatus({ state: 'idle', detail: 'stopped' });
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.fetchPulse();
        this.updateStatus({ state: 'running', lastSuccessAt: new Date().toISOString() });
        // Reset backoff on success
        this.errorBackoffMs = 1000;
      } catch (err) {
        const error = err as Error;
        logger.error({ err: error }, 'gdelt poll failed');
        sourceErrorsTotal.inc({ source: this.name, code: 'poll' });
        this.updateStatus({ state: 'error', detail: error.message, lastErrorAt: new Date().toISOString() });
        
        // Exponential backoff with jitter to prevent thundering herd
        const jitter = Math.random() * 0.3; // 0-30% jitter
        const backoffWithJitter = this.errorBackoffMs * (1 + jitter);
        await delay(backoffWithJitter);
        
        // Increase backoff for next error (exponential)
        this.errorBackoffMs = Math.min(this.errorBackoffMs * 2, this.MAX_BACKOFF_MS);
        continue; // Skip normal poll interval on error
      }
      await delay(this.cfg.pollIntervalSec * 1000);
    }
  }

  private async fetchPulse(): Promise<void> {
    const url = this.options.baseUrl;
    const response = await fetch(url, { keepalive: false });
    if (!response.ok) {
      sourceErrorsTotal.inc({ source: this.name, code: String(response.status) });
      throw new Error(`gdelt pulse error ${response.status}`);
    }
    let payload: GdeltResponse | null = null;
    try {
      payload = (await response.json()) as GdeltResponse;
    } catch {
      this.updateStatus({ state: 'error', detail: 'bad_json', lastErrorAt: new Date().toISOString() });
      return;
    }
    const articles = payload?.articles ?? [];
    for (const article of articles) {
      const id = article.url ?? article.title;
      if (!id || this.seen.has(id)) {
        continue;
      }
      // LRU eviction: remove oldest entry if we hit the limit
      if (this.seen.size >= this.MAX_SEEN_SIZE) {
        const firstKey = this.seen.values().next().value;
        if (firstKey) {
          this.seen.delete(firstKey);
        }
      }
      this.seen.add(id);
      const post: SocialPost = {
        id,
        platform: 'gdelt',
        authorId: article.source ?? 'gdelt',
        authorHandle: article.source,
        text: `${article.title ?? ''}\n\n${article.description ?? ''}`.trim(),
        lang: article.language,
        link: article.url,
        topics: extractKeywords(article),
        tags: extractKeywords(article),
        publishedAt: article.published ?? new Date().toISOString(),
        capturedAt: new Date().toISOString(),
        engagement: { score: article.score },
        source: 'gdelt:pulse',
        raw: article as Record<string, unknown>
      };
      try {
        storeSocialPost(post);
      } catch (err) {
        logger.error({ err }, 'failed to persist gdelt article');
      }
      this.deps.emitter.emit('post', post);
      sourceEventsTotal.inc({ source: this.name });
    }
  }

  private updateStatus(status: Partial<SourceStatus>): void {
    this.statusState = { ...this.statusState, ...status };
    this.deps.onStatus(this.name, this.statusState);
  }
}

type GdeltResponse = {
  articles?: Array<{
    title?: string;
    description?: string;
    url?: string;
    source?: string;
    language?: string;
    published?: string;
    score?: number;
    keywords?: string[];
  }>;
};

function extractKeywords(article: NonNullable<GdeltResponse['articles']>[number]): string[] {
  const picks = new Set<string>();
  for (const keyword of article.keywords ?? []) {
    if (typeof keyword === 'string' && keyword.trim().length > 0) {
      picks.add(keyword.trim().toLowerCase());
    }
  }
  if (article.title) {
    for (const match of article.title.matchAll(/#(\w{3,})/g)) {
      picks.add(match[1].toLowerCase());
    }
  }
  return Array.from(picks);
}
