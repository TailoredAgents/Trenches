#!/usr/bin/env tsx
import { createSSEClient, createInMemoryLastEventIdStore, TtlCache, quantileFloor } from '@trenches/util';

type Migration = { ts: number; mint: string; pool: string; source: string };
type Candidate = { t: string; mint: string };

const migrationsUrl = process.env.MIGRATIONS_URL ?? 'http://127.0.0.1:4018/events/migrations';
const candidatesUrl = process.env.CANDIDATES_URL ?? 'http://127.0.0.1:4013/events/candidates';
const safeUrl = process.env.SAFE_URL ?? 'http://127.0.0.1:4014/events/safe';

const recent: Map<string, number> = new Map();
const lags: number[] = [];

function start() {
  const storeM = createInMemoryLastEventIdStore();
  const storeC = createInMemoryLastEventIdStore();
  const storeS = createInMemoryLastEventIdStore();
  const dedup = new TtlCache<string, boolean>(60 * 1000);
  const srcM = createSSEClient(migrationsUrl, {
    lastEventIdStore: storeM,
    onEvent: (e) => {
      if (!e?.data || e.data === 'ping') return;
      try {
        const m = JSON.parse(e.data) as Migration;
        recent.set(m.mint, m.ts);
      } catch (err) {
        // ignore malformed migration payloads
      }
    }
  });
  const handleCand = (data: string, id?: string) => {
    try {
      if (id && dedup.get(id)) return;
      if (id) dedup.set(id, true);
      const c = JSON.parse(data) as Candidate;
      if (c && c.mint && recent.has(c.mint)) {
        const mTs = recent.get(c.mint)!;
        const lag = Date.now() - mTs;
        lags.push(lag);
        if (lags.length % 5 === 0) {
          console.log('p50', quantileFloor(lags, 0.5), 'ms p95', quantileFloor(lags, 0.95), 'ms');
        }
      }
    } catch (err) {
      // ignore malformed candidate payloads
    }
  };
  const srcC = createSSEClient(candidatesUrl, {
    lastEventIdStore: storeC,
    onEvent: (e) => { if (!e?.data || e.data === 'ping') return; handleCand(e.data, e.lastEventId); }
  });
  const srcS = createSSEClient(safeUrl, {
    lastEventIdStore: storeS,
    onEvent: (e) => { if (!e?.data || e.data === 'ping') return; handleCand(e.data, e.lastEventId); }
  });

  process.on('SIGINT', () => {
    console.log('final p50', quantileFloor(lags, 0.5), 'ms p95', quantileFloor(lags, 0.95), 'ms');
    srcM.dispose(); srcC.dispose(); srcS.dispose();
    process.exit(0);
  });
}

start();

