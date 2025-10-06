import 'dotenv/config';
import { countSimOutcomes, countSimByMint, lastSimOutcomeTs } from '@trenches/persistence';

const n24 = countSimOutcomes(24 * 3600);
const nAll = countSimOutcomes();
const last = lastSimOutcomeTs();
const top = countSimByMint(24 * 3600);

console.log(
  `sim-count: last24h=${n24} total=${nAll} lastTs=${last} topMints=${top.map((t) => `${t.mint}:${t.n}`).join(',')}`
);

