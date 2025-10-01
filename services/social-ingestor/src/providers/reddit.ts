import { setTimeout as delay } from 'timers/promises';
import { SocialPost } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { storeSocialPost } from '@trenches/persistence';
import { SourceDependencies, SocialSource, SourceStatus } from '../types';

const logger = createLogger('social:reddit');

export type RedditConfig = {
  enabled: boolean;
  subreddits: string[];
  pollIntervalSec: number;
  appType?: 'installed' | 'web';
};

export function createRedditSource(
  config: RedditConfig,
  deps: SourceDependencies,
  options: { clientId?: string; clientSecret?: string; refreshToken?: string }
): SocialSource {
  return new RedditSource(config, deps, options);
}

class RedditSource implements SocialSource {
  readonly name = 'reddit';
  private statusState: SourceStatus = { state: 'idle', detail: 'not started' };
  private stopped = false;
  private accessToken?: string;
  private tokenExpiresAt = 0;
  private seen = new Set<string>();

  constructor(
    private readonly cfg: RedditConfig,
    private readonly deps: SourceDependencies,
    private readonly credentials: { clientId?: string; clientSecret?: string; refreshToken?: string }
  ) {}

  status(): SourceStatus {
    return this.statusState;
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.updateStatus({ state: 'idle', detail: 'disabled via config' });
      return;
    }
    // Normalize env-derived credentials (trim spaces/newlines)
    const clientId = (this.credentials.clientId ?? '').trim();
    const clientSecret = (this.credentials.clientSecret ?? '').trim();
    const refreshToken = (this.credentials.refreshToken ?? '').trim();
    const mode = (this.cfg.appType ?? 'installed').trim() as 'installed' | 'web';
    logger.info({ mode }, 'reddit provider starting with appType');
    if ((mode === 'web' && (!clientId || !clientSecret || !refreshToken)) || (mode !== 'web' && (!clientId || !refreshToken))) {
      this.updateStatus({ state: 'idle', detail: 'missing reddit credentials' });
      return;
    }
    if (this.cfg.subreddits.length === 0) {
      this.updateStatus({ state: 'idle', detail: 'no subreddits configured' });
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
        await this.ensureAccessToken();
        await Promise.all(this.cfg.subreddits.map((sub) => this.fetchSubreddit(sub)));
        this.updateStatus({ state: 'running', lastSuccessAt: new Date().toISOString() });
      } catch (err) {
        const error = err as Error;
        logger.error({ err: error }, 'reddit poll failed');
        this.updateStatus({ state: 'error', detail: error.message, lastErrorAt: new Date().toISOString() });
        await delay(Math.min(this.cfg.pollIntervalSec * 1000, 60_000));
      }
      await delay(this.cfg.pollIntervalSec * 1000);
    }
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return;
    }
    const clientId = (this.credentials.clientId ?? '').trim();
    const clientSecret = (this.credentials.clientSecret ?? '').trim();
    const refreshToken = (this.credentials.refreshToken ?? '').trim();
    const tokenUrl = 'https://www.reddit.com/api/v1/access_token';
    const ua = 'TrenchesBot/1.0 by Trenches';
    const withSecret = Buffer.from(`${clientId}:${clientSecret ?? ''}`).toString('base64');
    const withInstalled = Buffer.from(`${clientId}:`).toString('base64');
    async function attempt(basic: string) {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': ua
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken ?? ''
        }),
        keepalive: false
      });
      return res;
    }
    const basic = (this.cfg.appType ?? 'installed').trim() === 'web' ? withSecret : withInstalled;
    const response = await attempt(basic);
    if (!response.ok) {
      try {
        const body = await response.text();
        logger.warn({ status: response.status, body: body.slice(0, 300) }, 'reddit refresh failed');
      } catch (err) {
        logger.warn({ err }, 'failed to read reddit refresh error body');
      }
      throw new Error(`reddit token refresh failed ${response.status}`);
    }
    const payload = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = payload.access_token;
    this.tokenExpiresAt = Date.now() + payload.expires_in * 1000;
    logger.info({ status: response.status }, 'reddit refresh ok');
  }

  private async fetchSubreddit(subreddit: string): Promise<void> {
    if (!this.accessToken) return;
    const url = `https://oauth.reddit.com/r/${subreddit}/new?limit=50`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'User-Agent': 'trenches-agent/0.1 (+https://trenches.local)'
      },
      keepalive: false
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '5');
      logger.warn({ subreddit, retryAfter }, 'reddit rate limited');
      await delay(retryAfter * 1000);
      return;
    }
    if (!response.ok) {
      throw new Error(`reddit API error ${response.status}`);
    }
    const payload = (await response.json()) as RedditListing;
    const children = payload.data?.children ?? [];
    for (const child of children) {
      const post = child.data;
      if (!post?.id) continue;
      const key = post.id;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const socialPost: SocialPost = {
        id: key,
        platform: 'reddit',
        authorId: post.author_fullname ?? post.author ?? 'unknown',
        authorHandle: post.author,
        text: post.title ? `${post.title}\n\n${post.selftext ?? ''}`.trim() : post.selftext ?? '',
        lang: post.lang,
        link: `https://reddit.com${post.permalink}`,
        topics: extractSubredditTopics(post),
        tags: post.link_flair_text ? [post.link_flair_text.toLowerCase()] : [],
        publishedAt: new Date((post.created_utc ?? 0) * 1000).toISOString(),
        capturedAt: new Date().toISOString(),
        engagement: {
          score: post.score,
          replies: post.num_comments,
          likes: post.ups,
          quotes: post.num_crossposts
        },
        source: `reddit:r/${subreddit}`,
        raw: post as Record<string, unknown>
      };
      try {
        storeSocialPost(socialPost);
      } catch (err) {
        logger.error({ err }, 'failed to persist reddit post');
      }
      this.deps.emitter.emit('post', socialPost);
    }
  }

  private updateStatus(status: Partial<SourceStatus>): void {
    this.statusState = { ...this.statusState, ...status };
    this.deps.onStatus(this.name, this.statusState);
  }
}

type RedditListing = {
  data?: {
    children?: Array<{
      data?: RedditPost;
    }>;
  };
};

type RedditPost = {
  id: string;
  author?: string;
  author_fullname?: string; // eslint-disable-line @typescript-eslint/naming-convention
  title?: string;
  selftext?: string;
  permalink?: string;
  score?: number;
  ups?: number;
  num_comments?: number; // eslint-disable-line @typescript-eslint/naming-convention
  num_crossposts?: number; // eslint-disable-line @typescript-eslint/naming-convention
  created_utc?: number; // eslint-disable-line @typescript-eslint/naming-convention
  lang?: string;
  link_flair_text?: string; // eslint-disable-line @typescript-eslint/naming-convention
};

function extractSubredditTopics(post: RedditPost): string[] {
  const topics = new Set<string>();
  if (post.link_flair_text) {
    topics.add(post.link_flair_text.toLowerCase());
  }
  if (post.title) {
    for (const match of post.title.matchAll(/#(\w{3,})/g)) {
      topics.add(match[1].toLowerCase());
    }
  }
  return Array.from(topics);
}


