import fs from 'fs/promises';
import WebSocket from 'ws';
import { SocialPost } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { storeSocialPost } from '@trenches/persistence';
import { SourceDependencies, SocialSource, SourceStatus } from '../types';
import { jetstreamEventsTotal, jetstreamErrorsTotal, jetstreamLastEventTs } from '../metrics';

const logger = createLogger('social:bluesky');

export type BlueskyConfig = {
  enabled: boolean;
  cursorPath: string;
  reconnectBackoffSec: number;
};

export function createBlueskySource(
  config: BlueskyConfig,
  deps: SourceDependencies,
  options: { streamUrl: string; token?: string }
): SocialSource {
  return new BlueskySource(config, deps, options);
}

type JetstreamOp = {
  action?: string;
  path?: string;
  cid?: string;
  uri?: string;
  record?: {
    ['$type']?: string;
    text?: string;
    createdAt?: string;
    langs?: string[];
    tags?: string[];
    uri?: string;
    rkey?: string;
  } & Record<string, unknown>;
};

type JetstreamEvent = {
  kind?: string;
  seq?: number;
  repo?: string;
  authorHandle?: string;
  ops?: JetstreamOp[];
};

class BlueskySource implements SocialSource {
  readonly name = 'bluesky';
  private statusState: SourceStatus = { state: 'idle', detail: 'not started' };
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;
  private cursor?: number;
  private readonly seenPosts = new Set<string>();
  private lastMessageAt = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private useFallback = false;

  constructor(
    private readonly cfg: BlueskyConfig,
    private readonly deps: SourceDependencies,
    private readonly options: { streamUrl: string; token?: string }
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
    await this.restoreCursor();
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'shutdown');
    }
    this.socket = undefined;
    this.updateStatus({ state: 'idle', detail: 'stopped' });
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    const query = this.cursor ? `?cursor=${this.cursor}` : '';
    const primary = this.options.streamUrl.replace(/\/$/, '');
    const fallback = 'wss://jetstream2.us-west.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
    const baseUrl = this.useFallback ? fallback : primary;
    const url = `${baseUrl}${query}`;
    const headers: Record<string, string> = {};
    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }
    this.socket = new WebSocket(url, { headers });

    this.socket.on('open', () => {
      logger.info({ url }, 'connected to bluesky jetstream');
      this.updateStatus({ state: 'running', detail: 'streaming' });
      this.lastMessageAt = Date.now();
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        const now = Date.now();
        if (now - this.lastMessageAt > 40_000) {
          logger.warn('jetstream heartbeat missed; reconnecting');
          try { this.socket?.close(); } catch {}
        }
      }, 30_000);
    });

    this.socket.on('message', (data: WebSocket.RawData) => {
      try {
        this.lastMessageAt = Date.now();
        const payload = JSON.parse(data.toString()) as JetstreamEvent;
        const now = Math.floor(Date.now() / 1000);
        jetstreamEventsTotal.inc();
        jetstreamLastEventTs.set(now);
        this.updateStatus({ lastSuccessAt: new Date().toISOString(), lastEventTs: now });
        void this.handleMessage(payload);
      } catch (err) {
        jetstreamErrorsTotal.inc();
        logger.error({ err }, 'failed to parse jetstream payload');
      }
    });

    this.socket.on('close', (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      logger.warn({ code, reason }, 'jetstream connection closed');
      this.updateStatus({ state: 'backing_off', detail: `closed: ${code}` });
      if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined; }
      if (code === 1006) {
        this.useFallback = !this.useFallback;
      }
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (err) => {
      jetstreamErrorsTotal.inc();
      logger.error({ err }, 'jetstream socket error');
      this.updateStatus({ state: 'error', detail: (err as Error).message, lastErrorAt: new Date().toISOString() });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    const delay = Math.max(1_000, Math.min(30_000, this.cfg.reconnectBackoffSec * 1_000));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private async restoreCursor(): Promise<void> {
    try {
      const raw = await fs.readFile(this.cfg.cursorPath, 'utf-8');
      const parsed = Number(raw.trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        this.cursor = parsed;
        logger.info({ cursor: parsed }, 'restored bluesky cursor');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn({ err }, 'failed to restore bluesky cursor');
      }
    }
  }

  private async persistCursor(): Promise<void> {
    if (this.cursor === undefined) {
      return;
    }
    const dir = this.cfg.cursorPath.includes('/') ? this.cfg.cursorPath.slice(0, this.cfg.cursorPath.lastIndexOf('/')) : '';
    if (dir) {
      await fs.mkdir(dir, { recursive: true });
    }
    await fs.writeFile(this.cfg.cursorPath, String(this.cursor), 'utf-8');
  }

  private async handleMessage(event: JetstreamEvent): Promise<void> {
    if (typeof event.seq === 'number') {
      this.cursor = event.seq;
      await this.persistCursor().catch((err) => {
        logger.error({ err }, 'failed to persist bluesky cursor');
      });
    }
    if (event.kind !== 'commit') {
      return;
    }
    for (const op of event.ops ?? []) {
      const record = op.record;
      if (!record) continue;
      if (record['$type'] !== 'app.bsky.feed.post') continue;
      const uri = (op.uri ?? record.uri ?? record.rkey ?? record.cid ?? `${event.repo ?? 'unknown'}:${event.seq ?? 0}`) as string;
      if (!uri || this.seenPosts.has(uri)) {
        continue;
      }
      this.seenPosts.add(uri);
      const post: SocialPost = {
        id: uri,
        platform: 'bluesky',
        authorId: event.repo ?? 'unknown',
        authorHandle: event.authorHandle,
        text: record.text ?? '',
        lang: record.langs?.[0],
        link: `https://bsky.app/profile/${event.repo ?? ''}/post/${record.rkey ?? ''}`,
        topics: extractHashtags(record.text ?? ''),
        tags: extractTags(record.tags),
        publishedAt: record.createdAt ?? new Date().toISOString(),
        capturedAt: new Date().toISOString(),
        engagement: {},
        source: 'bluesky:jetstream',
        raw: { event, op }
      };
      try {
        storeSocialPost(post);
      } catch (err) {
        logger.error({ err }, 'failed to persist bluesky post');
      }
      this.deps.emitter.emit('post', post);
    }
  }

  private updateStatus(status: Partial<SourceStatus>): void {
    this.statusState = { ...this.statusState, ...status };
    this.deps.onStatus(this.name, this.statusState);
  }
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#(\w{3,})/g);
  if (!matches) {
    return [];
  }
  return matches.map((tag) => tag.slice(1).toLowerCase());
}

function extractTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0).map((tag) => tag.toLowerCase());
}
