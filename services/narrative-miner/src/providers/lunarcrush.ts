import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { lunarcrushBiasAppliedTotal, lunarcrushErrorsTotal, lunarcrushLastPollTs } from '../metrics';

const logger = createLogger('lunarcrush');

export type LunarHealth = { status: 'ok' | 'degraded'; lastPollTs: number | null; message?: string };

export class LunarCrushOverlay {
  private timer?: NodeJS.Timeout;
  private lastPollTs: number | null = null;
  private hotTopics = new Set<string>();
  private hotHandles = new Set<string>();
  private headerScheme: 'bearer' | 'x-api-key' | 'lc-api-key' = 'bearer';
  private stopped = false;
  private healthMsg: string | undefined;

  start(): void {
    const cfg = getConfig();
    if (!cfg.lunarcrush?.enabled) return;
    this.stopped = false;
    this.loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  getHealth(): LunarHealth {
    return { status: this.lastPollTs ? 'ok' : 'degraded', lastPollTs: this.lastPollTs, message: this.healthMsg };
  }

  // Exposed for admin: perform one poll immediately
  async pollOnce(): Promise<void> {
    const cfg = getConfig();
    const key = process.env.LUNARCRUSH_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) {
      if (this.headerScheme === 'bearer') headers['Authorization'] = `Bearer ${key}`;
      else if (this.headerScheme === 'x-api-key') headers['x-api-key'] = String(key);
      else if (this.headerScheme === 'lc-api-key') headers['LC-API-Key'] = String(key);
    }
    const urlTopics = `${cfg.lunarcrush.baseUrl}${cfg.lunarcrush.endpoints.topics}`;
    const urlInfluencers = `${cfg.lunarcrush.baseUrl}${cfg.lunarcrush.endpoints.influencers}`;
    await this.fetchTopics(urlTopics, headers);
    await this.fetchInfluencers(urlInfluencers, headers);
    const now = Date.now();
    this.lastPollTs = now;
    lunarcrushLastPollTs.set(Math.floor(now / 1000));
  }

  getBiasFor(label?: string, authorHandle?: string): { topic: boolean; influencer: boolean } {
    const topicHit = label ? this.hotTopics.has(label.toLowerCase()) : false;
    const handleHit = authorHandle ? this.hotHandles.has(authorHandle.toLowerCase()) : false;
    if (topicHit || handleHit) lunarcrushBiasAppliedTotal.inc();
    return { topic: topicHit, influencer: handleHit };
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), ms);
  }

  private async loop(): Promise<void> {
    if (this.stopped) return;
    const cfg = getConfig();
    const { pollSec, baseUrl, endpoints } = cfg.lunarcrush;
    const key = process.env.LUNARCRUSH_API_KEY;
    const urlTopics = `${baseUrl}${endpoints.topics}`;
    const urlInfluencers = `${baseUrl}${endpoints.influencers}`;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) {
        if (this.headerScheme === 'bearer') headers['Authorization'] = `Bearer ${key}`;
        if (this.headerScheme === 'x-api-key') headers['x-api-key'] = String(key);
        if (this.headerScheme === 'lc-api-key') headers['LC-API-Key'] = String(key);
      } else {
        this.healthMsg = 'awaiting_credentials';
      }
      try {
        await this.fetchTopics(urlTopics, headers);
        await this.fetchInfluencers(urlInfluencers, headers);
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (/401|403/.test(msg)) {
          // rotate header scheme and retry once
          this.headerScheme = this.headerScheme === 'bearer' ? 'x-api-key' : this.headerScheme === 'x-api-key' ? 'lc-api-key' : 'bearer';
          const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
          if (this.headerScheme === 'bearer') hdrs['Authorization'] = `Bearer ${key}`;
          if (this.headerScheme === 'x-api-key') hdrs['x-api-key'] = String(key);
          if (this.headerScheme === 'lc-api-key') hdrs['LC-API-Key'] = String(key);
          await this.fetchTopics(urlTopics, hdrs);
          await this.fetchInfluencers(urlInfluencers, hdrs);
        } else {
          throw err;
        }
      }
      const now = Date.now();
      this.lastPollTs = now;
      lunarcrushLastPollTs.set(Math.floor(now / 1000));
    } catch (err: any) {
      lunarcrushErrorsTotal.inc();
      const msg = (err && err.message) || String(err);
      if (/401|403/.test(msg)) {
        this.healthMsg = 'unauthorized';
        // flip
        this.headerScheme = this.headerScheme === 'bearer' ? 'x-api-key' : 'bearer';
      }
      logger.error({ err }, 'lunarcrush poll error');
    } finally {
      const next = Math.max(30_000, (pollSec ?? 180) * 1000);
      this.schedule(next);
    }
  }

  private async fetchTopics(url: string, headers: Record<string, string>): Promise<void> {
    const res = await fetch(url, { headers, keepalive: false });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    const data: any = await res.json();
    const list: string[] = Array.isArray(data?.topics)
      ? data.topics
      : Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
      ? data.items
      : [];
    const normalized = list
      .map((x) => (typeof x === 'string' ? x : String((x as any).label ?? (x as any).topic ?? '')))
      .map((s) => s.toLowerCase())
      .filter((s) => s.length >= 2);
    this.hotTopics = new Set(normalized);
  }

  private async fetchInfluencers(url: string, headers: Record<string, string>): Promise<void> {
    const res = await fetch(url, { headers, keepalive: false });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${text}`);
    }
    const data: any = await res.json();
    const list: string[] = Array.isArray(data?.influencers)
      ? data.influencers
      : Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
      ? data.items
      : [];
    const normalized = list
      .map((x) => (typeof x === 'string' ? x : String((x as any).handle ?? (x as any).name ?? '')))
      .map((s) => s.toLowerCase().replace(/^@/, ''))
      .filter((s) => s.length >= 2);
    this.hotHandles = new Set(normalized);
  }
}

