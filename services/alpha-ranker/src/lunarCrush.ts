import EventSource from 'eventsource';
import { createLogger } from '@trenches/logger';
import {
  lunarcrushActiveSymbols,
  lunarcrushActiveTopics,
  lunarcrushErrorsTotal,
  lunarcrushEventsTotal,
  lunarcrushLastEventTs
} from './metrics';

export type LunarFeatures = {
  boost: number;
  metrics: {
    lunar_galaxy_norm: number;
    lunar_dominance_norm: number;
    lunar_interactions_log: number;
    lunar_alt_rank_norm: number;
    lunar_recency_weight: number;
    lunar_boost: number;
  };
  matched: boolean;
};

export type LunarStatus = {
  status: 'disabled' | 'ok' | 'degraded';
  lastEventTs: number | null;
  lastErrorTs: number | null;
  message?: string;
  errors: number;
  activeTopics: number;
  activeSymbols: number;
};

type SignalRecord = {
  galaxyScore?: number;
  socialDominance?: number;
  interactions24h?: number;
  altRank?: number;
  sentiment?: number;
  updatedAt: number;
};

type Options = {
  enabled: boolean;
  handshakeUrl: string | null;
  apiKey?: string;
};

function coerceNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeKey(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^[@#$]/, '').toLowerCase();
}

export class LunarCrushStream {
  private readonly enabled: boolean;
  private readonly logger = createLogger('alpha-lunarcrush');
  private readonly apiKey?: string;
  private readonly origin?: string;
  private handshakeUrl: string | null;
  private handshake?: EventSource;
  private stream?: EventSource;
  private reconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;
  private lastEventTs: number | null = null;
  private lastErrorTs: number | null = null;
  private lastMessage: string | undefined;
  private errors = 0;
  private readonly topics = new Map<string, SignalRecord>();
  private readonly symbols = new Map<string, SignalRecord>();

  constructor(options: Options) {
    this.enabled = options.enabled;
    this.handshakeUrl = options.handshakeUrl;
    this.apiKey = options.apiKey;
    this.origin = this.handshakeUrl ? new URL(this.handshakeUrl).origin : undefined;
  }

  start(): void {
    if (!this.enabled) {
      this.lastMessage = 'disabled';
      return;
    }
    if (!this.handshakeUrl) {
      this.lastMessage = 'missing_credentials';
      this.logger.warn('LunarCrush stream disabled – missing handshake URL or API key');
      return;
    }
    this.openHandshake();
  }

  stop(): void {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      this.handshake?.close();
    } catch {
      /* noop */
    }
    try {
      this.stream?.close();
    } catch {
      /* noop */
    }
  }

  evaluate(keywords: string[]): LunarFeatures {
    if (!this.enabled || this.topics.size === 0 && this.symbols.size === 0) {
      return {
        boost: 0,
        metrics: {
          lunar_galaxy_norm: 0,
          lunar_dominance_norm: 0,
          lunar_interactions_log: 0,
          lunar_alt_rank_norm: 0,
          lunar_recency_weight: 0,
          lunar_boost: 0
        },
        matched: false
      };
    }

    const now = Date.now();
    const seen = new Set<SignalRecord>();

    const candidates: string[] = [];
    for (const raw of keywords) {
      const base = normalizeKey(raw);
      if (!base) continue;
      candidates.push(base);
      candidates.push(base.replace(/\s+/g, '-'));
      candidates.push(base.replace(/\s+/g, ''));
    }

    for (const key of candidates) {
      const topic = this.topics.get(key);
      if (topic) seen.add(topic);
      const symbol = this.symbols.get(key);
      if (symbol) seen.add(symbol);
    }

    if (seen.size === 0) {
      return {
        boost: 0,
        metrics: {
          lunar_galaxy_norm: 0,
          lunar_dominance_norm: 0,
          lunar_interactions_log: 0,
          lunar_alt_rank_norm: 0,
          lunar_recency_weight: 0,
          lunar_boost: 0
        },
        matched: false
      };
    }

    let galaxy = 0;
    let dominance = 0;
    let interactions = 0;
    let altRank = 0;
    let recency = 0;

    for (const signal of seen) {
      const ageMs = now - signal.updatedAt;
      const weight = Math.max(0, 1 - ageMs / (10 * 60 * 1000));
      recency = Math.max(recency, weight);
      if (signal.galaxyScore !== undefined) {
        galaxy = Math.max(galaxy, Math.min(1, signal.galaxyScore / 100));
      }
      if (signal.socialDominance !== undefined) {
        dominance = Math.max(dominance, Math.min(1, signal.socialDominance / 100));
      }
      if (signal.interactions24h !== undefined) {
        const norm = Math.log1p(Math.max(0, signal.interactions24h)) / Math.log1p(1_000_000);
        interactions = Math.max(interactions, Math.min(1, norm));
      }
      if (signal.altRank !== undefined) {
        const norm = 1 - Math.min(100, Math.max(0, signal.altRank)) / 100;
        altRank = Math.max(altRank, Math.max(0, norm));
      }
    }

    const boost = Math.min(0.18, recency * (galaxy * 0.4 + dominance * 0.25 + interactions * 0.2 + altRank * 0.15));

    return {
      boost,
      metrics: {
        lunar_galaxy_norm: galaxy,
        lunar_dominance_norm: dominance,
        lunar_interactions_log: interactions,
        lunar_alt_rank_norm: altRank,
        lunar_recency_weight: recency,
        lunar_boost: boost
      },
      matched: true
    };
  }

  getStatus(): LunarStatus {
    if (!this.enabled) {
      return {
        status: 'disabled',
        lastEventTs: null,
        lastErrorTs: null,
        message: 'disabled',
        errors: 0,
        activeTopics: 0,
        activeSymbols: 0
      };
    }
    const status = this.lastEventTs ? 'ok' : 'degraded';
    return {
      status,
      lastEventTs: this.lastEventTs,
      lastErrorTs: this.lastErrorTs,
      message: this.lastMessage,
      errors: this.errors,
      activeTopics: this.topics.size,
      activeSymbols: this.symbols.size
    };
  }

  private openHandshake(): void {
    if (this.shuttingDown || !this.handshakeUrl) {
      return;
    }
    this.clearReconnectTimer();
    this.closeSources();

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.apiKey && !this.handshakeUrl.includes('key=')) {
      headers.Authorization = Bearer ;
    }

    this.handshake = new EventSource(this.handshakeUrl, { headers });

    this.handshake.onopen = () => {
      this.logger.info('connected to LunarCrush handshake stream');
      this.lastMessage = 'connected';
    };

    this.handshake.onerror = (err) => {
      this.handleError('handshake', err);
      this.scheduleReconnect();
    };

    this.handshake.addEventListener('endpoint', (ev: any) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      this.handleEndpoint(data);
    });

    this.handshake.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      this.handlePayload(data);
    };
  }

  private closeSources(): void {
    try {
      this.handshake?.close();
    } catch {
      /* noop */
    }
    try {
      this.stream?.close();
    } catch {
      /* noop */
    }
    this.handshake = undefined;
    this.stream = undefined;
  }

  private handleEndpoint(data: string): void {
    const trimmed = data.trim();
    if (!trimmed) return;

    let target = trimmed;
    if (!/^https?:/i.test(trimmed)) {
      if (!this.origin) {
        return;
      }
      if (trimmed.startsWith('/')) {
        target = ${this.origin};
      } else {
        target = ${this.origin}/;
      }
    }
    try {
      const url = new URL(target);
      if (this.apiKey && !url.searchParams.get('key')) {
        url.searchParams.set('key', this.apiKey);
      }
      this.openStream(url.toString());
    } catch (err) {
      this.handleError('endpoint', err);
    }
  }

  private openStream(url: string): void {
    if (this.shuttingDown) return;

    if (this.stream) {
      try {
        this.stream.close();
      } catch {
        /* noop */
      }
      this.stream = undefined;
    }

    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (this.apiKey && !url.includes('key=')) {
      headers.Authorization = Bearer ;
    }

    this.stream = new EventSource(url, { headers });

    this.stream.onopen = () => {
      this.logger.info({ url }, 'connected to LunarCrush data stream');
      this.lastMessage = 'stream_open';
    };

    this.stream.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '';
      this.handlePayload(data);
    };

    this.stream.onerror = (err) => {
      this.handleError('stream', err);
      this.scheduleReconnect();
    };
  }

  private handlePayload(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'ping') {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch (err) {
      this.logger.debug({ raw: trimmed }, 'ignored non-json LunarCrush payload');
      return;
    }

    const rows = this.extractRows(payload);
    if (rows.length === 0) {
      return;
    }

    const now = Date.now();
    let updates = 0;
    for (const row of rows) {
      if (this.applyRecord(row, now)) {
        updates += 1;
      }
    }

    if (updates > 0) {
      this.lastEventTs = now;
      this.lastMessage = 'data';
      lunarcrushEventsTotal.inc(updates);
      lunarcrushLastEventTs.set(Math.floor(now / 1000));
      lunarcrushActiveTopics.set(this.topics.size);
      lunarcrushActiveSymbols.set(this.symbols.size);
    }
  }

  private extractRows(payload: unknown): Array<Record<string, unknown>> {
    if (!payload) return [];
    if (Array.isArray(payload)) {
      return payload.filter((item): item is Record<string, unknown> => typeof item === 'object' && !!item && !Array.isArray(item));
    }
    if (typeof payload !== 'object') {
      return [];
    }
    const obj = payload as Record<string, unknown>;
    const candidates: unknown[] = [];
    if (Array.isArray(obj.data)) candidates.push(...obj.data);
    if (Array.isArray(obj.topics)) candidates.push(...obj.topics);
    if (Array.isArray(obj.items)) candidates.push(...obj.items);
    if (obj.result) {
      const result = obj.result as any;
      if (Array.isArray(result)) candidates.push(...result);
      if (Array.isArray(result?.data)) candidates.push(...result.data);
    }
    if (candidates.length === 0) {
      candidates.push(obj);
    }
    return candidates
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && !!item && !Array.isArray(item));
  }

  private applyRecord(raw: Record<string, unknown>, now: number): boolean {
    const galaxy =
      coerceNumber(raw.galaxy_score) ??
      coerceNumber((raw.metrics as any)?.galaxy_score) ??
      coerceNumber((raw as any).galaxyScore);
    const dominance =
      coerceNumber(raw.social_dominance) ??
      coerceNumber((raw.metrics as any)?.social_dominance) ??
      coerceNumber((raw as any).socialDominance);
    const interactions =
      coerceNumber(raw.interactions_24h) ??
      coerceNumber((raw.metrics as any)?.interactions_24h) ??
      coerceNumber((raw as any).interactions);
    const altRank =
      coerceNumber(raw.alt_rank) ??
      coerceNumber((raw.metrics as any)?.alt_rank) ??
      coerceNumber((raw as any).altRank);
    const sentiment =
      coerceNumber(raw.sentiment) ??
      coerceNumber((raw.metrics as any)?.sentiment) ??
      coerceNumber((raw as any).sentimentScore);

    if (
      galaxy === undefined &&
      dominance === undefined &&
      interactions === undefined &&
      altRank === undefined &&
      sentiment === undefined
    ) {
      return false;
    }

    const topic = normalizeKey(
      (raw.topic as string | undefined) ??
        (raw.name as string | undefined) ??
        (raw.id as string | undefined) ??
        (raw.slug as string | undefined)
    );
    const symbol = normalizeKey(
      (raw.symbol as string | undefined) ??
        (raw.ticker as string | undefined) ??
        (raw.cashtag as string | undefined) ??
        (raw.asset as string | undefined) ??
        (raw.coin as string | undefined)
    );

    if (!topic && !symbol) {
      return false;
    }

    const record: SignalRecord = {
      galaxyScore: galaxy,
      socialDominance: dominance,
      interactions24h: interactions,
      altRank,
      sentiment,
      updatedAt: now
    };

    let applied = false;
    if (topic) {
      this.topics.set(topic, record);
      applied = true;
    }
    if (symbol) {
      this.symbols.set(symbol, record);
      applied = true;
    }
    return applied;
  }

  private handleError(source: string, err: unknown): void {
    this.errors += 1;
    this.lastErrorTs = Date.now();
    const message = err instanceof Error ? err.message : String(err);
    this.lastMessage = `${source}_error`;
    lunarcrushErrorsTotal.inc();
    this.logger.warn({ source, err: message }, 'LunarCrush stream error');
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openHandshake();
    }, 30_000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}


