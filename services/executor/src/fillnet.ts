import { FillPrediction } from '@trenches/shared';
import { insertFillPrediction } from '@trenches/persistence';
import { registerGauge } from '@trenches/metrics';
import fs from 'fs';
import { loadConfig } from '@trenches/config';

export type PredictContext = {
  route: string;
  amountLamports: number;
  slippageBps: number;
  congestionScore?: number;
  lpSol?: number;
  spreadBps?: number;
  volatilityBps?: number;
  ageSec?: number;
  rugProb?: number;
};

const pfillAvg = registerGauge({ name: 'fillnet_pfill_avg', help: 'Average predicted fill probability' });
const slipExpGauge = registerGauge({ name: 'fillnet_slip_expected_bps', help: 'Expected slippage bps' });
const timeExpGauge = registerGauge({ name: 'fillnet_time_expected_ms', help: 'Expected time to land ms' });

let model: { wFill?: number[]; wSlip?: number[]; wTime?: number[] } | null = null;
function ensureModel(): void {
  if (model !== null) return;
  try {
    const cfg = loadConfig();
    const path = (cfg as any).fillnet?.modelPath ?? 'models/fillnet_v2.json';
    if (fs.existsSync(path)) {
      const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
      model = raw;
    } else {
      model = {};
    }
  } catch { model = {}; }
}

export async function predictFill(ctx: PredictContext, persistCtx?: Record<string, unknown>): Promise<FillPrediction> {
  ensureModel();
  const ts = Date.now();
  const cong = ctx.congestionScore ?? 0.5;
  const depth = Math.max(0, ctx.lpSol ?? 0);
  const spread = Math.max(0, ctx.spreadBps ?? 0);
  const vol = Math.max(0, ctx.volatilityBps ?? spread);
  const age = Math.max(0, ctx.ageSec ?? 0);
  const rug = Math.min(1, Math.max(0, ctx.rugProb ?? 0.5));
  const slipReq = Math.max(1, ctx.slippageBps);
  // Heuristic signals
  const sDepth = Math.min(1, depth / 50);
  const sCong = cong; // 1=good
  const sSpread = 1 - Math.min(1, spread / 200);
  const sVol = 1 - Math.min(1, vol / 300);
  const sAge = Math.min(1, age / 600);
  const sRug = 1 - rug;
  const sSlipReq = Math.min(1, slipReq / 300);
  const feats = [1, sDepth, sCong, sSpread, sVol, sAge, sRug, sSlipReq];
  const dot = (w: number[]|undefined) => (w && w.length === feats.length) ? w.reduce((a, wi, i) => a + wi * feats[i], 0) : null;
  const zFill = dot(model?.wFill ?? undefined);
  const pFill = zFill !== null ? (1 / (1 + Math.exp(-(zFill as number)))) : (1 / (1 + Math.exp(-(2.2 * sDepth + 1.5 * sCong + 0.8 * sSpread + 0.7 * sVol + 0.2 * sAge + 0.8 * sRug + 0.6 * sSlipReq - 3.0))));
  const zSlip = dot(model?.wSlip ?? undefined);
  const expSlipBps = zSlip !== null ? Math.max(1, Math.round(zSlip as number)) : Math.max(5, Math.round((spread * 0.4 + vol * 0.3 + (1 - sDepth) * 120 + (1 - sCong) * 80)));
  const zTime = dot(model?.wTime ?? undefined);
  const expTimeMs = zTime !== null ? Math.max(50, Math.round(zTime as number)) : Math.max(200, Math.round(400 + (1 - sCong) * 900 + (1 - sDepth) * 700 + (spread / 200) * 500));
  const pred: FillPrediction = { ts, route: ctx.route, pFill, expSlipBps, expTimeMs };
  try { insertFillPrediction(pred, { ctx }); } catch {}
  try { pfillAvg.set(pFill); slipExpGauge.set(expSlipBps); timeExpGauge.set(expTimeMs); } catch {}
  return pred;
}
