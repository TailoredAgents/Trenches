import { createLogger } from '@trenches/logger';
import { stEventsTotal, stErrorsTotal, stLastPollTs } from '../metrics';
import { getConfig } from '@trenches/config';
import { TtlCache } from '@trenches/util';

const logger = createLogger('onchain:solanatracker');

export type StItem = { mint?: string; address?: string; symbol?: string; poolAddress?: string; ts?: number; [k: string]: any };
export type StEvent = { source: 'solanatracker'; mint: string; symbol?: string; poolAddress?: string; ts?: number };

type Health = { status: 'ok' | 'degraded'; lastPollTs: number | null; message?: string };

export class SolanaTrackerProvider {
  private timer?: NodeJS.Timeout;
  private lastPoll: number | null = null;
  private cache: TtlCache<string, boolean>;
  private stopped = false;
  private healthMsg: string | undefined;

  constructor(private readonly onEvent: (ev: StEvent) => void) {
    const cfg = getConfig();
    const ttlMs = Math.max(5_000, (cfg.providers?.solanatracker?.ttlSec ?? 10) * 1000);
    this.cache = new TtlCache<string, boolean>(ttlMs);
  }

  start(): void {
    this.stopped = false;
    this.loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  getHealth(): Health {
    let status: 'ok' | 'degraded' = this.lastPoll ? 'ok' : 'degraded';
    if (!process.env.SOLANATRACKER_API_KEY) {
      status = 'degraded';
      this.healthMsg = 'awaiting_credentials';
    }
    return { status, lastPollTs: this.lastPoll, message: this.healthMsg };
  }

  private schedule(nextMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.loop(), nextMs);
  }

  private async loop(): Promise<void> {
    if (this.stopped) return;
    const cfg = getConfig();
    const { enabled, baseUrl, pollSec, endpoints } = cfg.providers?.solanatracker ?? ({} as any);
    if (!enabled) { this.schedule(5000); return; }
    const key = process.env.SOLANATRACKER_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
      headers['x-api-key'] = key; // support either schema
    } else {
      this.healthMsg = 'awaiting_credentials';
    }
    try {
      if (endpoints?.trending) {
        await this.fetchList(`${baseUrl}/tokens/trending?timeframe=1h`, headers);
      }
      if (endpoints?.latest) {
        await this.fetchList(`${baseUrl}/tokens/latest`, headers);
      }
      if (endpoints?.launchpads?.pumpfun) {
        await this.fetchList(`${baseUrl}/launchpad/pumpfun?state=graduating,graduated`, headers);
      }
      if (endpoints?.launchpads?.jupstudio) {
        await this.fetchList(`${baseUrl}/launchpad/jup-studio?state=graduating,graduated`, headers);
      }
      const now = Date.now();
      this.lastPoll = now;
      stLastPollTs.set(Math.floor(now / 1000));
    } catch (err: any) {
      stErrorsTotal.inc();
      const msg = (err && err.message) || String(err);
      if (/401|403/.test(msg)) {
        this.healthMsg = 'unauthorized';
      }
      logger.error({ err }, 'solanatracker polling error');
    } finally {
      const delay = Math.max(1000, (pollSec ?? 8) * 1000);
      this.schedule(delay);
    }
  }

  private async fetchList(url: string, headers: Record<string, string>): Promise<void> {
    try {
      const res = await fetch(url, { headers, keepalive: false });
      if (res.status === 429) {
        this.healthMsg = 'rate_limited';
        logger.warn({ url }, 'solanatracker rate limited');
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${text}`);
      }
      const data: any = await res.json();
      const items: StItem[] = Array.isArray(data?.tokens) ? data.tokens : Array.isArray(data) ? data : (data?.items ?? []);
      for (const it of items) {
        const mint = it.mint || it.address;
        if (!mint) continue;
        if (this.cache.has(mint)) continue;
        this.cache.set(mint, true);
        stEventsTotal.inc();
        const ev: StEvent = { source: 'solanatracker', mint, symbol: it.symbol, poolAddress: it.poolAddress, ts: it.ts ? Number(it.ts) : undefined };
        this.onEvent(ev);
      }
    } catch (err) {
      stErrorsTotal.inc();
      logger.error({ err, url }, 'solanatracker fetch failed');
    }
  }
}
