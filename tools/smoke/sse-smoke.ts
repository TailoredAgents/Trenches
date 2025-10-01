#!/usr/bin/env tsx
import EventSource from 'eventsource';

type Migration = { ts: number; mint: string; pool: string; source: string };
type Candidate = { t: string; mint: string };

const migrationsUrl = process.env.MIGRATIONS_URL ?? 'http://127.0.0.1:4018/events/migrations';
const candidatesUrl = process.env.CANDIDATES_URL ?? 'http://127.0.0.1:4013/events/candidates';
const safeUrl = process.env.SAFE_URL ?? 'http://127.0.0.1:4014/events/safe';

const recent: Map<string, number> = new Map();
const lags: number[] = [];

function quantile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function start() {
  const srcM = new EventSource(migrationsUrl);
  const srcC = new EventSource(candidatesUrl);
  const srcS = new EventSource(safeUrl);
  srcM.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data) as Migration;
      recent.set(m.mint, m.ts);
    } catch {}
  };
  const handleCand = (data: string) => {
    try {
      const c = JSON.parse(data) as Candidate;
      if (c && c.mint && recent.has(c.mint)) {
        const mTs = recent.get(c.mint)!;
        const lag = Date.now() - mTs;
        lags.push(lag);
        if (lags.length % 5 === 0) {
          console.log('p50', quantile(lags, 0.5), 'ms p95', quantile(lags, 0.95), 'ms');
        }
      }
    } catch {}
  };
  srcC.onmessage = (e) => handleCand(e.data);
  srcS.onmessage = (e) => handleCand(e.data);

  process.on('SIGINT', () => {
    console.log('final p50', quantile(lags, 0.5), 'ms p95', quantile(lags, 0.95), 'ms');
    process.exit(0);
  });
}

start();

