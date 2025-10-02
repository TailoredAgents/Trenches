import fs from 'fs';
import path from 'path';

async function main(): Promise<void> {
  const dataDir = 'data';
  const modelPath = 'models/pump_classifier_v1.json';
  fs.mkdirSync(dataDir, { recursive: true });
  const jsonl = [
    { text: '100x moon pump lambo now', label: 1 },
    { text: 'instant pump rocket emojis', label: 1 },
    { text: 'buy now big gains meme', label: 1 },
    { text: 'scam airdrop free tokens', label: 1 },
    { text: 'long-term project building community', label: 0 },
    { text: 'open source code released today', label: 0 },
    { text: 'dev update with roadmap', label: 0 },
    { text: 'partnership with tooling provider', label: 0 }
  ];
  const dataPath = path.join(dataDir, 'pump_labels.jsonl');
  fs.writeFileSync(dataPath, jsonl.map((x) => JSON.stringify(x)).join('\n'));
  const { default: child_process } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const p = child_process.spawn(process.execPath, ['-e', `require('tsx').cli(['training/pump_classifier/train.ts','${dataPath}','${modelPath}'])`], { stdio: 'inherit', shell: false });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('train failed')));
  });
  const { scoreText } = await import('../../services/safety-engine/src/pumpClassifier');
  const pPump = scoreText('pump to the moon lambo');
  const pNormal = scoreText('open source roadmap and dev update');
  console.log(`pump-smoke: trained=true p(pump)=${pPump.toFixed(3)} p(normal)=${pNormal.toFixed(3)}`);
}

void main();

