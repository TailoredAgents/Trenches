import { Connection, PublicKey } from '@solana/web3.js';
import { HolderSafetyResult } from './types';

function normalizeAddress(value: string | PublicKey | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === 'string' ? value : value.toBase58();
}

export async function checkHolderSkew(
  connection: Connection,
  mintAddress: string,
  ignoreAccounts: string[],
  poolAccounts: Array<string | undefined>,
  holderTopCap: number
): Promise<HolderSafetyResult> {
  const mint = new PublicKey(mintAddress);
  const [largestAccounts, supply] = await Promise.all([
    connection.getTokenLargestAccounts(mint),
    connection.getTokenSupply(mint)
  ]);

  const totalSupply = Number(supply.value.amount) / 10 ** supply.value.decimals;
  if (!Number.isFinite(totalSupply) || totalSupply === 0) {
    return { ok: false, reasons: ['holder_supply_zero'], topTenShare: 1, whaleFlag: false };
  }

  const ignoreSet = new Set(
    [...ignoreAccounts, ...poolAccounts.filter(Boolean)].map((addr) => addr?.toLowerCase()).filter(Boolean) as string[]
  );

  const filtered = largestAccounts.value
    .map((entry) => ({ entry, address: normalizeAddress(entry.address) }))
    .filter((item) => {
      if (!item.address) {
        return false;
      }
      return !ignoreSet.has(item.address.toLowerCase());
    })
    .slice(0, 10);

  const topTenAmount = filtered.reduce((sum, item) => sum + (item.entry.uiAmount ?? 0), 0);
  const topTenShare = totalSupply === 0 ? 1 : topTenAmount / totalSupply;
  const ok = topTenShare <= holderTopCap;
  const reasons = ok ? [] : ['holder_top_concentration'];
  const whaleFlag = !ok;

  return { ok, reasons, topTenShare, whaleFlag };
}
