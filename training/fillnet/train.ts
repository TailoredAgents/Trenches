#!/usr/bin/env tsx
// Minimal training stub: writes a simple linear model JSON for fillnet v2
import fs from 'fs';

function main() {
  const model = {
    wFill: [ -2.8, 2.2, 1.5, 0.8, 0.7, 0.2, 0.8, 0.6 ],
    wSlip: [ 10, -80, -60, -40, -30, -10, -20, -15 ],
    wTime: [ 500, -700, -600, -300, -300, -100, -200, -150 ]
  };
  fs.mkdirSync('models', { recursive: true });
  fs.writeFileSync('models/fillnet_v2.json', JSON.stringify(model));
  console.log('wrote models/fillnet_v2.json');
}

main();

