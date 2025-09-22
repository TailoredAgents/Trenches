import { setTimeout as delay } from 'timers/promises';
import { SocialPost } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { storeSocialPost } from '@trenches/persistence';
import { TtlCache } from '@trenches/util';
import { SourceDependencies, SocialSource, SourceStatus } from '../types';

const logger = createLogger('social:neynar');

export type NeynarConfig = {
  enabled: boolean;
  watchFids: number[];
  keywords: string[];
  pollIntervalSec: number;
};

const LAST_POLLED_CACHE = new TtlCache<string, string>(60_000);

type NeynarCast = {
  hash: string;
  text?: string;
  timestamp?: string;
  parent_author?: { fid?: number };
  author?: { fid?: number; username?: string; displayName?: string };
  meta?: { language?: string };
  reactions?: { likes?: number; recasts?: number }; // eslint-disable-line @typescript-eslint/naming-convention
  replies?: { count?: number };
  recasts?: { count?: number };
  quoted_casts?: { count?: number }; // eslint-disable-line @typescript-eslint/naming-convention
  embeds?: Array<{ url?: string }>;
};

export function createNeynarSource(
  config: NeynarConfig,
  deps: SourceDependencies,
  options: { apiKey?: string; baseUrl: string }
): SocialSource {
  return new NeynarSource(config, deps, options);
}

class NeynarSource implements SocialSource {
  readonly name = 'neynar';
  private statusState: SourceStatus = { state: 'idle', detail: 'not started' };
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private seenCasts = new Set<string>();

  constructor(
    private readonly cfg: NeynarConfig,
    private readonly deps: SourceDependencies,
    private readonly options: { apiKey?: string; baseUrl: string }
  ) {}

  status(): SourceStatus {
    return this.statusState;
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.updateStatus({ state: 'idle', detail: 'disabled via config' });
      return;
    }
    if (!this.options.apiKey) {
      this.updateStatus({ state: 'idle', detail: 'missing NEYNAR_API_KEY' });
      return;
    }
    if (this.cfg.watchFids.length === 0 && this.cfg.keywords.length === 0) {
      this.updateStatus({ state: 'idle', detail: 'no watch FIDs or keywords configured' });
      return;
    }
    this.stopped = false;
    this.updateStatus({ state: 'running', detail: 'starting poll loop' });
    void this.pollLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.updateStatus({ state: 'idle', detail: 'stopped' });
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.fetchNewCasts();
        this.updateStatus({ state: 'running', lastSuccessAt: new Date().toISOString() });
      } catch (err) {
        const error = err as Error;
        logger.error({ err: error }, 'neynar poll failed');
        this.updateStatus({ state: 'error', detail: error.message, lastErrorAt: new Date().toISOString() });
        await delay(Math.min(this.cfg.pollIntervalSec * 1000, 60_000));
      }
      await delay(this.cfg.pollIntervalSec * 1000);
    }
  }

  private async fetchNewCasts(): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-key': this.options.apiKey ?? ''
    };
    const baseUrl = this.options.baseUrl.replace(/\/$/, '');

    const promises: Promise<void>[] = [];
    for (const fid of this.cfg.watchFids) {
      const url = `${baseUrl}/v2/farcaster/casts?fid=${fid}&limit=50`;
      promises.push(this.handleCastFetch(url, headers, `fid:${fid}`));
    }
    for (const keyword of this.cfg.keywords) {
      const url = `${baseUrl}/v2/farcaster/search?q=${encodeURIComponent(keyword)}&limit=50`;
      promises.push(this.handleCastFetch(url, headers, `kw:${keyword}`));
    }
    await Promise.all(promises);
  }

  private async handleCastFetch(url: string, headers: Record<string, string>, label: string): Promise<void> {
    try {
      const response = await fetch(url, { headers, keepalive: false });
      if (!response.ok) {
        throw new Error(`Neynar API ${label} responded ${response.status}`);
      }
      const payload = (await response.json()) as { result?: { casts?: NeynarCast[] } };
      const casts = payload?.result?.casts ?? [];
      if (casts.length === 0) {
        return;
      }
      for (const cast of casts) {
        if (!cast.hash) {
          continue;
        }
        const key = cast.hash;
        const lastSignature = LAST_POLLED_CACHE.get(key);
        const publishedAt = cast.timestamp ?? new Date().toISOString();
        if (lastSignature && lastSignature === publishedAt) {
          continue;
        }
        if (this.seenCasts.has(key)) {
          continue;
        }
        this.seenCasts.add(key);
        LAST_POLLED_CACHE.set(key, publishedAt);
        const post = this.castToPost(cast, label);
        await this.dispatch(post);
      }
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, url, label }, 'neynar fetch error');
      throw error;
    }
  }

  private async dispatch(post: SocialPost): Promise<void> {
    try {
      await storeSocialPost(post);
    } catch (err) {
      logger.error({ err }, 'failed to persist neynar post');
    }
    this.deps.emitter.emit('post', post);
  }

  private castToPost(cast: NeynarCast, label: string): SocialPost {
    const text = cast.text ?? '';
    const hashtags = extractHashtags(text);
    const url = `https://warpcast.com/${cast.author?.username ?? 'unknown'}/${encodeURIComponent(cast.hash)}`;
    return {
      id: cast.hash,
      platform: 'farcaster',
      authorId: String(cast.author?.fid ?? 'unknown'),
      authorHandle: cast.author?.username,
      text,
      lang: cast.meta?.language,
      link: url,
      topics: hashtags,
      tags: hashtags,
      publishedAt: cast.timestamp ?? new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      engagement: {
        likes: cast.reactions?.likes,
        reposts: cast.recasts?.count ?? cast.reactions?.recasts,
        replies: cast.replies?.count,
        quotes: cast.quoted_casts?.count
      },
      source: `neynar:${label}`,
      raw: cast as Record<string, unknown>
    };
  }

  private updateStatus(status: Partial<SourceStatus>): void {
    this.statusState = { ...this.statusState, ...status };
    this.deps.onStatus(this.name, this.statusState);
  }
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#(\w{3,})/g);
  if (!matches) return [];
  return matches.map((tag) => tag.slice(1).toLowerCase());
}
