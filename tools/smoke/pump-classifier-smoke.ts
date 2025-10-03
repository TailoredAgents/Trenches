import fs from 'fs';
import path from 'path';
import { trainPumpClassifier } from '../../training/pump_classifier/train';

async function main(): Promise<void> {
  const dataPath = path.resolve('data/pump_labels.jsonl');
  const modelPath = path.resolve('models/pump_classifier_v1.json');
  if (!fs.existsSync(dataPath)) {
    console.log('pump-smoke: dataset missing, skipped');
    return;
  }
  const result = await trainPumpClassifier({ dataPath, outPath: modelPath });
  const { scoreText } = await import('../../services/safety-engine/src/pumpClassifier');
  const pumpProb = scoreText('massive pump to the moon 100x instant gains');
  const normalProb = scoreText('open-source roadmap update with developer call');
  console.log(
    result.trained
      ? `pump-smoke: trained=true p(pump)=${pumpProb.toFixed(3)} p(normal)=${normalProb.toFixed(3)}`
      : `pump-smoke: trained=false p(pump)=${pumpProb.toFixed(3)} p(normal)=${normalProb.toFixed(3)}`
  );
}

void main();
