import 'dotenv/config';

function arg(name: string, def: string): string {
  const ix = process.argv.indexOf(name);
  return ix >= 0 && process.argv[ix + 1] ? process.argv[ix + 1] : def;
}

const N = parseInt(arg('--n', '500'), 10);
const M = parseInt(arg('--mints', '150'), 10);
const R = parseInt(arg('--routes', '4'), 10);

function rndBase(n: number): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < n; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function rndMint(i: number): string { return `MINT_${(i % M).toString(36)}_${rndBase(6)}`; }
function pickRoute(i: number): string { return `ROUTE_${(i % R) + 1}`; }

const nowSec = Math.floor(Date.now() / 1000);
let out = '';
for (let i = 0; i < N; i += 1) {
  const mint = rndMint(i);
  const route = pickRoute(i);
  const ts = nowSec + (i % 300);
  const inAmount = 1_000_000 + (i % 1000);
  const outAmount = 990_000 + (i % 1000);
  const slippageBps = 100 + (i % 50);
  const cuPrice = 3000 + (i % 2000);
  const plan = {
    mint,
    gate: 'alpha_fillnet',
    route,
    sizeSol: 0.006 + ((i % 10) * 0.0001),
    slippageBps,
    jitoTipLamports: 0,
    side: 'buy'
  };
  const ctx = {
    ts,
    inAmount,
    outAmount,
    slippageBps,
    cuPrice,
    candidate: {
      mint,
      lpSol: 5 + (i % 7),
      spreadBps: 80 + (i % 50),
      ageSec: 120 + (i % 300)
    }
  } as any;
  out += JSON.stringify({ plan, context: ctx }) + '\n';
}

process.stdout.write(out);
