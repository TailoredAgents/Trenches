import { PublicKey } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createRpcConnection } from '@trenches/util';
import { upsertPrice, getDb } from '@trenches/persistence';

function readI32LE(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}
function readI64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}
function decodePythPriceV2(data: Buffer): { price: number; expo: number; pubSlot: bigint } | null {
  try {
    if (data.length < 240) return null;
    const expo = readI32LE(data, 20);
    const aggOffset = 208;
    const rawPrice = readI64LE(data, aggOffset);
    const pubSlot = data.readBigUInt64LE(aggOffset + 24);
    const scaled = Number(rawPrice) * Math.pow(10, expo);
    if (!Number.isFinite(scaled)) return null;
    return { price: scaled, expo, pubSlot };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const acct = process.env.PYTH_SOL_USD_PRICE_ACCOUNT || (cfg as any).priceUpdater?.pythSolUsdPriceAccount || '';
  if (!acct) {
    const ts = Date.now();
    upsertPrice(ts, 'SOL', 150.0);
    console.log('price-updater-smoke: mocked SOL/USD=150');
    return;
  }
  try {
    const connection = createRpcConnection(cfg.rpc, { commitment: 'confirmed' });
    const pubkey = new PublicKey(acct);
    const info = await connection.getAccountInfo(pubkey, { commitment: 'confirmed' });
    if (!info?.data) {
      console.error('price-updater-smoke: failed to read account');
      return;
    }
    const buf = Buffer.from(info.data as Buffer);
    const decoded = decodePythPriceV2(buf);
    if (!decoded) {
      console.error('price-updater-smoke: failed to decode pyth account');
      return;
    }
    const ts = Date.now();
    upsertPrice(ts, 'SOL', decoded.price);
    const db = getDb();
    const row = db.prepare('SELECT ts FROM prices WHERE symbol = ? ORDER BY ts DESC LIMIT 1').get('SOL') as { ts?: number } | undefined;
    const ageSec = row?.ts ? Math.max(0, Math.floor((Date.now() - (row.ts as number)) / 1000)) : 0;
    console.log(`price-updater-smoke: SOL/USD=${decoded.price.toFixed(4)} age=${ageSec}s`);
  } catch (err) {
    console.error('price-updater-smoke: error', err);
  }
}

void main();
