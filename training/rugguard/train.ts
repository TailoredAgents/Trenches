#!/usr/bin/env tsx
// Minimal RugGuard trainer stub: writes a model json
import fs from 'fs';

function main() {
  const model = { w: [ -1.0, -0.6, 0.4, 0.3 ] };
  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/rugguard_v2.json', JSON.stringify(model));
  console.log('wrote models/rugguard_v2.json');
}

main();

