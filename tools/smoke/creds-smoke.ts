import 'dotenv/config';

async function main(): Promise<void> {
  const port = Number(process.env.SOCIAL_INGESTOR_PORT ?? 4012);
  const url = `http://127.0.0.1:${port}/healthz`;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      console.log(`creds-smoke: request_failed status=${r.status}`);
      return;
    }
    const j = (await r.json()) as { sources?: Array<{ name: string; status: { state?: string } }>; providers?: any };
    const map = new Map<string, string>();
    for (const s of j.sources ?? []) {
      map.set(s.name, (s.status?.state ?? 'idle'));
    }
    const odUrl = `http://127.0.0.1:${Number(process.env.ONCHAIN_DISCOVERY_PORT ?? 4013)}/healthz`;
    let birdeye = false;
    try {
      const od = await fetch(odUrl);
      const odJson = (await od.json()) as { birdeyeApiKey?: boolean };
      birdeye = Boolean((odJson as any).birdeyeApiKey);
    } catch {}
    const line = `creds-smoke: neynar=${map.get('neynar') ?? 'idle'} bluesky=${map.get('bluesky') ?? 'idle'} reddit=${map.get('reddit') ?? 'idle'} telegram=${map.get('telegram') ?? 'idle'} birdeye=apiKey:${birdeye}`;
    console.log(line);
    // Warn if keys present but not running after ~15s grace
    const haveKeys = {
      neynar: Boolean(process.env.NEYNAR_API_KEY),
      bluesky: Boolean(process.env.BLUESKY_JETSTREAM_TOKEN),
      reddit: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_REFRESH_TOKEN),
      telegram: Boolean(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_BOT_TOKEN)
    };
    const toCheck = Object.entries(haveKeys).filter(([_, v]) => v);
    if (toCheck.length > 0) {
      await new Promise((res) => setTimeout(res, 15000));
      const r2 = await fetch(url, { cache: 'no-store' });
      const j2 = (await r2.json()) as typeof j;
      const map2 = new Map<string, string>();
      for (const s of j2.sources ?? []) map2.set(s.name, (s.status?.state ?? 'idle'));
      for (const [name] of toCheck) {
        const st = map2.get(name) ?? 'idle';
        if (st !== 'running') {
          console.log(`WARN: provider ${name} has creds but state=${st}`);
        }
      }
    }
  } catch (err) {
    console.log(`creds-smoke: error ${(err as Error).message}`);
  }
}

void main();

