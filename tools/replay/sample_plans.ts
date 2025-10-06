import { writeFileSync } from 'fs';

function randMint(i: number): string {
  return 'Mint' + (100000 + i).toString();
}

const lines: string[] = [];
for (let i = 0; i < 500; i += 1) {
  const mint = randMint(i % 120);
  const plan = {
    mint,
    gate: 'alpha_fillnet',
    route: 'jupiter',
    sizeSol: 0.006 + ((i % 10) * 0.0001),
    slippageBps: 100,
    jitoTipLamports: 0,
    side: 'buy'
  };
  const ctx = {
    candidate: {
      mint,
      lpSol: 5 + (i % 7),
      spreadBps: 80 + (i % 50),
      ageSec: 120 + (i % 300)
    }
  };
  lines.push(JSON.stringify({ plan, context: ctx }));
}

writeFileSync(0, lines.join('\n'));

