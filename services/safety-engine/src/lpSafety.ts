import { Connection, PublicKey } from '@solana/web3.js';
import { LpSafetyResult } from './types';

const INCINERATOR_ADDRESS = '1nc1nerator11111111111111111111111111111111';

function resolveAddress(value: string | PublicKey | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return typeof value === 'string' ? value : value.toBase58();
}

export async function checkLpSafety(
  connection: Connection,
  lpMintAddress: string | undefined,
  lockers: string[],
  burnThreshold: number
): Promise<LpSafetyResult> {
  if (!lpMintAddress) {
    return { ok: false, reasons: ['missing_lp_mint'], lockedRatio: 0 };
  }

  const lpMint = new PublicKey(lpMintAddress);
  const [largestAccounts, supply] = await Promise.all([
    connection.getTokenLargestAccounts(lpMint),
    connection.getTokenSupply(lpMint)
  ]);

  const totalSupplyRaw = supply.value.amount;
  const decimals = supply.value.decimals;
  const totalSupply = Number(totalSupplyRaw) / 10 ** decimals;
  if (!Number.isFinite(totalSupply) || totalSupply === 0) {
    return { ok: false, reasons: ['lp_supply_zero'], lockedRatio: 0 };
  }

  const incineratorEntry = largestAccounts.value.find(
    (entry) => resolveAddress(entry.address) === INCINERATOR_ADDRESS
  );
  const incineratorAmount = incineratorEntry?.uiAmount ?? 0;
  const incineratorRatio = incineratorAmount / totalSupply;
  if (incineratorRatio >= burnThreshold) {
    return { ok: true, reasons: [], lockedRatio: incineratorRatio };
  }

  const lockerPrograms = new Set(lockers.map((addr) => addr.toLowerCase()));
  let lockerRatio = incineratorRatio;
  let lockerDetected = false;
  let lookupErrors = 0;

  for (const entry of largestAccounts.value.slice(0, 10)) {
    const entryAddress = resolveAddress(entry.address);
    if (!entryAddress) {
      continue;
    }

    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(entryAddress));
      if (!accountInfo) {
        continue;
      }
      const owner = accountInfo.owner.toBase58().toLowerCase();
      if (lockerPrograms.has(owner)) {
        lockerDetected = true;
        lockerRatio = (entry.uiAmount ?? 0) / totalSupply;
        if (lockerRatio >= burnThreshold) {
          return { ok: true, reasons: [], lockedRatio: lockerRatio };
        }
      }
    } catch (err) {
      lookupErrors += 1;
      continue;
    }
  }

  if (lookupErrors >= 3 && !lockerDetected) {
    return { ok: false, reasons: ['lp_locker_lookup_failed'], lockedRatio: incineratorRatio };
  }

  if (lockerDetected) {
    return { ok: false, reasons: ['lp_locker_insufficient'], lockedRatio: lockerRatio };
  }

  return { ok: false, reasons: ['lp_not_burned_or_locked'], lockedRatio: incineratorRatio };
}
