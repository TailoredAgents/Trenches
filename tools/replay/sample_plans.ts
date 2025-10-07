import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// tiny argv helper
function arg(name: string, def = ''): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : def;
}

const N = Math.max(1, parseInt(arg('--n', '500'), 10));
const M = Math.max(1, parseInt(arg('--mints', '150'), 10));
const R = Math.max(1, parseInt(arg('--routes', '4'), 10));
const outPath = (arg('--out', '').trim());

const nowSec = Math.floor(Date.now() / 1000);
let out = '';

function rndMint(i: number): string {
  // deterministic-ish symbol
  return `MINT_${(i % M).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function pickRoute(i: number): string {
  return `ROUTE_${(i % R) + 1}`;
}

for (let i = 0; i < N; i++) {
  const mint = rndMint(i);
  const route = pickRoute(i);
  const ts = nowSec + (i % 300);

  // tiny amounts (agent ignores in SHADOW; executor logs shadow outcomes only)
  const inAmount = 1_000_000 + (i % 1000);   // lamports in-token (placeholder)
  const outAmount = 990_000 + (i % 1000);    // lamports out-token (placeholder)
  const slippageBps = 100 + (i % 50);
  const cuPrice = 3000 + (i % 2000);

  // Emit shape executor's replay handler accepts: { plan, context:{...} }
  const plan = {
    side: 'buy',
    route,
    inAmount,
    outAmount,
    slippageBps,
    cuPrice
  };
  const context = {
    candidate: { mint, symbol: mint.slice(0, 6) },
    ts
  };

  out += JSON.stringify({ plan, context }) + '\n';
}

if (outPath) {
  const outAbs = path.isAbsolute(outPath) ? outPath : path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, out, 'utf8');
  console.log('wrote sample plans', { file: outAbs, count: N });
} else {
  process.stdout.write(out);
}
