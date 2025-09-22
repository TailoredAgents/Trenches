import { Connection, PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
  getExtensionTypes,
  getExtensionData,
  ExtensionType
} from '@solana/spl-token';
import { TokenSafetyResult } from './types';

const TRANSFER_HOOK_REASON = 'token2022_transfer_hook';
const TRANSFER_FEE_REASON = 'token2022_transfer_fee';
const DEFAULT_FROZEN_REASON = 'token2022_default_frozen';
const FREEZE_AUTHORITY_REASON = 'token2022_freeze_authority';
const MINT_NOT_FOUND_REASON = 'mint_missing';

export async function checkTokenSafety(connection: Connection, mintAddress: string): Promise<TokenSafetyResult> {
  const mintKey = new PublicKey(mintAddress);
  const accountInfo = await connection.getAccountInfo(mintKey);
  if (!accountInfo) {
    return { ok: false, reasons: [MINT_NOT_FOUND_REASON], isToken2022: false };
  }
  if (!accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    // Legacy SPL token mints are allowed by default.
    return { ok: true, reasons: [], isToken2022: false };
  }

  const reasons: string[] = [];
  const mint = unpackMint(mintKey, accountInfo, TOKEN_2022_PROGRAM_ID);
  if (mint.freezeAuthority) {
    reasons.push(FREEZE_AUTHORITY_REASON);
  }
  const extensions = getExtensionTypes(accountInfo.data);
  if (extensions.includes(ExtensionType.TransferHook)) {
    reasons.push(TRANSFER_HOOK_REASON);
  }
  if (extensions.includes(ExtensionType.TransferFeeConfig)) {
    reasons.push(TRANSFER_FEE_REASON);
  }
  if (extensions.includes(ExtensionType.DefaultAccountState)) {
    try {
      const data = getExtensionData(ExtensionType.DefaultAccountState, accountInfo.data);
      if (data && data.length > 0) {
        const state = data[0];
        if (state === 2) {
          reasons.push(DEFAULT_FROZEN_REASON);
        }
      }
    } catch (err) {
      reasons.push(DEFAULT_FROZEN_REASON);
    }
  }
  const ok = reasons.length === 0;
  return { ok, reasons, isToken2022: true };
}

