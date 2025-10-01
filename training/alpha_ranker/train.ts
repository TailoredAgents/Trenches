#!/usr/bin/env tsx
// Minimal alpha trainer stub: writes a model json with placeholder weights
import fs from 'fs';

function main() {
  const model = { horizons: ['10m','60m','24h'], weights: { w: [1,1,1] } };
  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/alpha_ranker_v1.json', JSON.stringify(model));
  console.log('wrote models/alpha_ranker_v1.json');
}

main();

