import { NextRequest } from 'next/server';

async function scrape(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

function parseProm(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = text.split(/\r?\n/);
  for (const ln of lines) {
    if (!ln || ln.startsWith('#')) continue;
    const sp = ln.trim();
    const m = sp.match(/^(?<name>[a-zA-Z_:][a-zA-Z0-9_:]*)(\{(?<labels>[^}]*)\})?\s+(?<val>-?[0-9.]+)(\s+\d+)?$/);
    if (!m || !m.groups) continue;
    const name = m.groups['name'];
    const val = Number(m.groups['val']);
    const labels = m.groups['labels'] ?? '';
    const key = labels ? `${name}{${labels}}` : name;
    if (!Number.isFinite(val)) continue;
    out[key] = val;
  }
  return out;
}

type PrevState = { t: number; counters: Record<string, number> };
let prev: PrevState | null = null;

export async function GET(_req: NextRequest) {
  const [pmText, siText, odText] = await Promise.all([
    scrape('http://127.0.0.1:4016/metrics'),
    scrape('http://127.0.0.1:4012/metrics'),
    scrape('http://127.0.0.1:4013/metrics')
  ]);
  const now = Date.now();
  const pm = pmText ? parseProm(pmText) : {};
  const si = siText ? parseProm(siText) : {};
  const od = odText ? parseProm(odText) : {};

  const exposure = pm['position_manager_total_size_sol'] ?? 0;
  const opened = pm['positions_opened_total'] ?? 0;
  const trailing = pm['position_trailing_activated_total'] ?? 0;

  const exits: Record<string, number> = {};
  for (const [k, v] of Object.entries(pm)) {
    if (k.startsWith('position_exits_total{')) {
      const m = k.match(/reason="([^"]+)"/);
      const reason = m ? m[1] : 'unknown';
      exits[reason] = v as number;
    }
  }

  // Social RPM by source from social_posts_ingested_total
  const socialTotals: Record<string, number> = {};
  for (const [k, v] of Object.entries(si)) {
    if (k.startsWith('social_posts_ingested_total{')) {
      const m = k.match(/source="([^"]+)"/);
      const source = m ? m[1] : 'unknown';
      socialTotals[source] = (socialTotals[source] ?? 0) + (v as number);
    }
  }

  // Upstream API RPM approximations via cache misses (overall and by type)
  const dexscreenerMissByType: Record<string, number> = {};
  const birdeyeMissByType: Record<string, number> = {};
  for (const [k, v] of Object.entries(od)) {
    if (k.startsWith('dexscreener_cache_misses_total{')) {
      const m = k.match(/type="([^"]+)"/);
      const typ = m ? m[1] : 'unknown';
      dexscreenerMissByType[typ] = (dexscreenerMissByType[typ] ?? 0) + (v as number);
    }
    if (k.startsWith('birdeye_cache_misses_total{')) {
      const m = k.match(/type="([^"]+)"/);
      const typ = m ? m[1] : 'unknown';
      birdeyeMissByType[typ] = (birdeyeMissByType[typ] ?? 0) + (v as number);
    }
  }
  const dexMiss = Object.values(dexscreenerMissByType).reduce((a, b) => a + b, 0);
  const beyeMiss = Object.values(birdeyeMissByType).reduce((a, b) => a + b, 0);

  const nowCounters: Record<string, number> = {
    ...Object.fromEntries(Object.entries(socialTotals).map(([src, v]) => [`social_${src}`, v])),
    dexscreener_miss: dexMiss,
    birdeye_miss: beyeMiss,
    ...Object.fromEntries(Object.entries(dexscreenerMissByType).map(([t, v]) => [`dexscreener_miss_type_${t}`, v])),
    ...Object.fromEntries(Object.entries(birdeyeMissByType).map(([t, v]) => [`birdeye_miss_type_${t}`, v]))
  };

  const socialRpm: Record<string, number> = {};
  let dexscreenerRpm = 0;
  let birdeyeRpm = 0;
  const dexscreenerRpmTypes: Record<string, number> = {};
  const birdeyeRpmTypes: Record<string, number> = {};
  if (prev) {
    const dtMin = Math.max((now - prev.t) / 60000, 0.001);
    for (const [k, v] of Object.entries(nowCounters)) {
      const dv = Math.max((v as number) - (prev.counters[k] ?? 0), 0);
      const rpm = dv / dtMin;
      if (k.startsWith('social_')) {
        const src = k.replace('social_', '');
        socialRpm[src] = rpm;
      } else if (k === 'dexscreener_miss') {
        dexscreenerRpm = rpm;
      } else if (k === 'birdeye_miss') {
        birdeyeRpm = rpm;
      } else if (k.startsWith('dexscreener_miss_type_')) {
        const typ = k.replace('dexscreener_miss_type_', '');
        dexscreenerRpmTypes[typ] = rpm;
      } else if (k.startsWith('birdeye_miss_type_')) {
        const typ = k.replace('birdeye_miss_type_', '');
        birdeyeRpmTypes[typ] = rpm;
      }
    }
  }
  prev = { t: now, counters: nowCounters };

  return new Response(
    JSON.stringify({
      exposureSol: exposure,
      opened,
      trailing,
      exits,
      apiRpm: {
        social: socialRpm,
        dexscreener: dexscreenerRpm,
        birdeye: birdeyeRpm,
        dexscreenerTypes: dexscreenerRpmTypes,
        birdeyeTypes: birdeyeRpmTypes
      }
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}
