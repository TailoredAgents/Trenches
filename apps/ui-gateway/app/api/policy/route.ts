import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const r = await fetch('http://127.0.0.1:4015/snapshot', { cache: 'no-store' });
    if (!r.ok) {
      return new Response(JSON.stringify({ congestion: 'unknown' }), { status: 200 });
    }
    const j = (await r.json()) as { congestion?: string };
    return new Response(JSON.stringify({ congestion: j.congestion ?? 'unknown' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ congestion: 'unknown' }), { status: 200 });
  }
}

