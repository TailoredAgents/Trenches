import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { RugGuardVerdict, TokenCandidate } from '@trenches/shared';

let rgModel: { w?: number[] } | null = null;
function ensureRgModel(): void {
  if (rgModel !== null) return;
  try {
    const modelPath = path.join('models', 'rugguard_v2.json');
    if (fs.existsSync(modelPath)) {
      rgModel = JSON.parse(fs.readFileSync(modelPath, 'utf-8'));
    } else { rgModel = {}; }
  } catch { rgModel = {}; }
}

export async function classify(mint: string, features: Record<string, number> = {}, deps?: { connection?: Connection; lpBurnThreshold?: number }): Promise<RugGuardVerdict> {
  ensureRgModel();
  const now = Date.now();
  const reasons: string[] = [];

  // Authority checks
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
  } catch {
    // If we cannot fetch, do not mark as pass
  }
  if (!(mintRevoked && freezeRevoked)) {
    reasons.push('mint_or_freeze_active');
  }

  // Simple heuristic rug probability (logistic over cues)
  const lpSol = features.lpSol ?? 0;
  const buys60 = features.buys60 ?? 0;
  const sells60 = features.sells60 ?? 0;
  const uniques60 = features.uniques60 ?? 0;
  const spreadBps = features.spreadBps ?? 0;
  const ageSec = features.ageSec ?? 0;
  const flow = sells60 > 0 ? buys60 / sells60 : buys60;

  // Weighted sum
  const feats = [
    (mintRevoked && freezeRevoked) ? 0 : 1,
    Math.min(1, lpSol / 50),
    Math.min(1, flow / 5),
    Math.min(1, uniques60 / 30),
    Math.min(1, spreadBps / 200),
    Math.min(1, ageSec / 600)
  ];
  let z = 0;
  if (rgModel?.w && rgModel.w.length === feats.length) {
    z = feats.reduce((a, v, i) => a + v * (rgModel!.w![i]), 0);
  } else {
    z = (mintRevoked && freezeRevoked ? -1.0 : 1.0) * 1.2 + (-Math.min(1, lpSol / 50)) * 0.6 + (-Math.min(1, flow / 5)) * 0.4 + (-Math.min(1, uniques60 / 30)) * 0.3 + (Math.min(1, spreadBps / 200)) * 0.2 + (-Math.min(1, ageSec / 600)) * 0.2;
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
