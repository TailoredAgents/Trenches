import { Connection, PublicKey } from '@solana/web3.js';
import { TtlCache } from '@trenches/util';

const cache = new TtlCache<string, number>(60_000);

export async function getMintDecimals(connection: Connection, mint: string): Promise<number> {
  const cached = cache.get(mint);
  if (cached !== undefined) {
    return cached;
  }
  const info = await connection.getParsedAccountInfo(new PublicKey(mint));
  if (!info.value) {
    cache.set(mint, 9);
    return 9;
  }
  const data = info.value.data as any;
  const decimals = data?.parsed?.info?.decimals;
  const value = typeof decimals === 'number' ? decimals : 9;
  cache.set(mint, value);
  return value;
}
