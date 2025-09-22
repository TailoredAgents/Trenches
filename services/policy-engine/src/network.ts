import { Connection } from '@solana/web3.js';
import { CongestionLevel } from '@trenches/shared';

const BASE_TPS = 4000; // approximate TPS for uncongested Solana mainnet

export async function getCongestionLevel(connection: Connection): Promise<CongestionLevel> {
  try {
    const samples = await connection.getRecentPerformanceSamples(1);
    if (!samples.length) {
      return 'p50';
    }
    const sample = samples[0];
    const tps = sample.numTransactions / sample.samplePeriodSecs;
    const ratio = tps / BASE_TPS;
    if (ratio >= 0.85) return 'p25';
    if (ratio >= 0.65) return 'p50';
    if (ratio >= 0.45) return 'p75';
    return 'p90';
  } catch (err) {
    return 'p75';
  }
}
