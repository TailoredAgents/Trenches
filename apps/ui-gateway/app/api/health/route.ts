import { NextRequest } from 'next/server';

const PORTS = [4010, 4011, 4012, 4013, 4014, 4015, 4016, 4017];

export async function GET(_req: NextRequest) {
  const results: Record<string, unknown> = {};
  await Promise.all(
    PORTS.map(async (p) => {
      try {
        const r = await fetch(`http://127.0.0.1:${p}/healthz`, { cache: 'no-store' });
        const json = await r.json();
        results[p] = { status: r.status, body: json };
      } catch (err) {
        results[p] = { status: 'error', error: (err as Error).message };
      }
    })
  );
  return new Response(JSON.stringify(results), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

