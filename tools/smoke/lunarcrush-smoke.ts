#!/usr/bin/env tsx
import EventSource from 'eventsource';

const key = (process.env.LUNARCRUSH_API_KEY ?? '').trim();
const hintedUrl = (process.env.LUNARCRUSH_MCP_SSE_URL ?? '').trim();
const handshakeUrl = hintedUrl || (key ? `https://lunarcrush.ai/sse?key=${encodeURIComponent(key)}` : 'https://lunarcrush.ai/sse');
const timeoutMs = Number(process.env.LUNAR_SMOKE_TIMEOUT ?? 10000);

let handshake: EventSource | null = null;
let stream: EventSource | null = null;
let events = 0;
let errors = 0;
const start = Date.now();
let finished = false;
let timer: ReturnType<typeof setTimeout>;

const closeAll = () => {
  try { handshake?.close(); } catch {}
  try { stream?.close(); } catch {}
};

const finish = (status: 'ok' | 'no_data' | 'error', message?: string) => {
  if (finished) return;
  finished = true;
  if (timer) { clearTimeout(timer); }
  closeAll();
  const elapsed = Date.now() - start;
  const detail = message ? ` ${message}` : '';
  console.log(`lunarcrush-smoke status=${status} events=${events} errors=${errors} elapsedMs=${elapsed}${detail}`);
  process.exit(0);
};

const openStream = (url: string) => {
  if (stream) return;
  stream = new EventSource(url, { headers: { Accept: 'text/event-stream' } });
  stream.onerror = () => {
    errors += 1;
  };
  stream.onmessage = (ev) => {
    const data = (ev.data ?? '').trim();
    if (!data || data === 'ping') return;
    events += 1;
  };
};

timer = setTimeout(() => {
  finish(events > 0 ? 'ok' : errors > 0 ? 'error' : 'no_data');
}, timeoutMs);

handshake = new EventSource(handshakeUrl, { headers: { Accept: 'text/event-stream' } });
handshake.onerror = () => {
  errors += 1;
};
handshake.addEventListener('endpoint', (ev: any) => {
  const data = typeof ev.data === 'string' ? ev.data.trim() : '';
  if (!data) return;
  let target = data;
  try {
    if (!/^https?:/i.test(target)) {
      const origin = new URL(handshakeUrl).origin;
      target = data.startsWith('/') ? `${origin}${data}` : `${origin}/${data}`;
    }
    if (key && !target.includes('key=')) {
      const url = new URL(target);
      url.searchParams.set('key', key);
      target = url.toString();
    }
    openStream(target);
  } catch {
    errors += 1;
  }
});
handshake.onmessage = (ev: any) => {
  const data = (ev.data ?? '').trim();
  if (!data || data === 'ping') {
    return;
  }
  try {
    const maybe = JSON.parse(data);
    if (maybe?.endpoint) {
      const origin = new URL(handshakeUrl).origin;
      const relative = String(maybe.endpoint);
      const full = relative.startsWith('/') ? `${origin}${relative}` : `${origin}/${relative}`;
      openStream(full);
    }
  } catch {
    // ignore non-json payloads
  }
};

process.on('SIGINT', () => finish(events > 0 ? 'ok' : 'no_data', 'interrupted'));
process.on('SIGTERM', () => finish(events > 0 ? 'ok' : 'no_data', 'terminated'));
