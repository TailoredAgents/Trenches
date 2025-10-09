import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { createLogger } from '@trenches/logger';
import { RugGuardVerdict, TokenCandidate } from '@trenches/shared';

const logger = createLogger('rugguard');

type RugguardModel = {
  weights?: number[];
  threshold?: number;
  status?: string;
  metrics?: Record<string, unknown>;
  created?: string;
};

let cachedModel: RugguardModel | null = null;

function ensureRgModel(): void {
  if (cachedModel !== null) return;
  try {
    const modelPath = path.join('models', 'rugguard_v2.json');
    if (fs.existsSync(modelPath)) {
      const raw = JSON.parse(fs.readFileSync(modelPath, 'utf-8')) as RugguardModel;
      cachedModel = raw;
      logger.info(
        {
          status: raw.status ?? 'unknown',
          created: raw.created,
          metrics: raw.metrics ?? {},
          train_size: (raw as any).train_size,
          holdout_size: (raw as any).holdout_size
        },
        'rugguard model loaded'
      );
    } else {
      cachedModel = {};
      logger.warn({ modelPath }, 'rugguard model file missing; using default heuristics');
    }
  } catch (err) {
    logger.error({ err }, 'failed to load rugguard model; falling back to heuristics');
    cachedModel = {};
  }
}

export async function classify(
  mint: string,
  features: Record<string, number> = {},
  deps?: { connection?: Connection; lpBurnThreshold?: number }
): Promise<RugGuardVerdict> {
  ensureRgModel();
  const now = Date.now();
  const reasons: string[] = [];

  let mintRevoked = false;
  let freezeRevoked = false;
  try {
    if (deps?.connection) {
      const info = await deps.connection.getParsedAccountInfo(new PublicKey(mint));
      const parsed: any = (info.value as any)?.data?.parsed?.info;
      const ma = parsed?.mintAuthority ?? null;
      const fa = parsed?.freezeAuthority ?? null;
      mintRevoked = ma === null || ma === undefined;
      freezeRevoked = fa === null || fa === undefined;
    }
  } catch (err) {
    logger.warn({ err, mint }, 'failed to fetch authority status for rugguard');
  }
  if (!(mintRevoked && freezeRevoked)) {
    reasons.push('mint_or_freeze_active');
  }

  const lpSol = features.lpSol ?? 0;
  const buys60 = features.buys60 ?? 0;
  const sells60 = features.sells60 ?? 0;
  const uniques60 = features.uniques60 ?? 0;
  const spreadBps = features.spreadBps ?? 0;
  const ageSec = features.ageSec ?? 0;
  const flow = sells60 > 0 ? buys60 / Math.max(1, sells60) : buys60;

  const authorityFeature = mintRevoked && freezeRevoked ? 0 : 1;
  const featureVector = [
    authorityFeature,
    Math.min(1, lpSol / 50),
    Math.min(1, flow / 5),
    Math.min(1, uniques60 / 30),
    Math.min(1, spreadBps / 200),
    Math.min(1, ageSec / 600)
  ];

  let z = 0;
  const weights = cachedModel?.weights ?? (cachedModel as any)?.w;
  if (Array.isArray(weights) && weights.length === featureVector.length + 1) {
    z = weights[0];
    for (let i = 0; i < featureVector.length; i += 1) {
      z += featureVector[i] * weights[i + 1];
    }
  } else if (Array.isArray(weights) && weights.length === featureVector.length) {
    z = featureVector.reduce((acc, value, idx) => acc + value * weights[idx], 0);
  } else {
    z =
      (authorityFeature ? 1.0 : -1.0) * 1.2 -
      Math.min(1, lpSol / 50) * 0.6 -
      Math.min(1, flow / 5) * 0.4 -
      Math.min(1, uniques60 / 30) * 0.3 +
      Math.min(1, spreadBps / 200) * 0.2 -
      Math.min(1, ageSec / 600) * 0.2;
  }
  const rugProb = 1 / (1 + Math.exp(-z));

  return { ts: now, mint, rugProb, reasons };
}

export function candidateToFeatures(c: TokenCandidate): Record<string, number> {
  return {
    lpSol: c.lpSol,
    buys60: c.buys60,
    sells60: c.sells60,
    uniques60: c.uniques60,
    spreadBps: c.spreadBps,
    ageSec: c.ageSec
  };
}
