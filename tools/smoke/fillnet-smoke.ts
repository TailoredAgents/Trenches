#!/usr/bin/env tsx
import { predictFill } from '../../services/executor/src/fillnet';

async function main(){
  const ctx = { route:'jupiter', amountLamports:1_000_000, slippageBps:100, congestionScore:0.7, lpSol:30, spreadBps:40, volatilityBps:60, ageSec:120, rugProb:0.3 };
  const v1 = await predictFill(ctx);
  console.log('fillnet v? pFill', v1.pFill.toFixed(3), 'expSlip', v1.expSlipBps, 'expTime', v1.expTimeMs);
}
main().catch((e)=>{ console.error(e); process.exit(1); });

