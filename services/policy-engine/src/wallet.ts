import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getDailyExecutedSpendSince, getOpenPositionsCount } from '@trenches/persistence';
import { loadWalletKeystore } from '@trenches/util/wallet';
import { WalletSnapshot } from './types';

const logger = createLogger('policy-wallet');

type KeypairLoadResult = { keypair: Keypair | null; reason?: "missing_keystore" | "invalid_format" };

export class WalletManager {
  private readonly connection: Connection;
  private readonly keypair: Keypair;
  private readonly disabled: boolean;
  private readonly disabledReason: string | null;
  private lastSnapshot: WalletSnapshot | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
    const loaded = loadWalletKeystore(process.env.WALLET_KEYSTORE_PATH || '.dev/wallet.json');
    if (loaded.ready && loaded.secretKey) {
      this.keypair = Keypair.fromSecretKey(loaded.secretKey);
      this.disabled = false;
      this.disabledReason = null;
      logger.info({ pubkey: this.keypair.publicKey.toBase58(), format: loaded.format, file: loaded.file }, 'wallet ready');
    } else {
      this.keypair = Keypair.generate();
      this.disabled = true;
      this.disabledReason = loaded.reason ?? 'missing_keystore';
      logger.warn({ reason: this.disabledReason, file: loaded.file }, 'policy engine wallet unavailable; running in shadow mode');
    }
  }

  get isReady(): boolean {
    return !this.disabled;
  }

  get status(): { ready: boolean; reason?: string } {
    return this.disabled ? { ready: false, reason: this.disabledReason ?? 'unavailable' } : { ready: true };
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  get snapshot(): WalletSnapshot | null {
    return this.lastSnapshot;
  }

  async refresh(): Promise<WalletSnapshot> {
    const config = loadConfig();
    const resolveDailyCap = (equitySol: number): number => {
      const pct = config.wallet.dailySpendCapPct;
      if (typeof pct === 'number' && pct > 0) {
        const cap = equitySol * pct;
        if (Number.isFinite(cap) && cap > 0) {
          return cap;
        }
      }
      const absolute = config.wallet.dailySpendCapSol;
      if (typeof absolute === 'number' && absolute > 0) {
        return absolute;
      }
      return Number.POSITIVE_INFINITY;
    };
    if (!this.isReady) {
      const cap = resolveDailyCap(0);
      const snapshot: WalletSnapshot = {
        equity: 0,
        free: 0,
        reserves: config.wallet.reservesSol,
        openPositions: 0,
        spendUsed: 0,
        spendRemaining: cap
      };
      this.lastSnapshot = snapshot;
      return snapshot;
    }

    const pubkey = this.publicKey;
    const [balanceLamports] = await Promise.all([
      this.connection.getBalance(pubkey, 'confirmed')
    ]);
    const equitySol = balanceLamports / LAMPORTS_PER_SOL;
    const reserves = config.wallet.reservesSol;
    const dailySpendWindowStart = new Date();
    dailySpendWindowStart.setUTCHours(0, 0, 0, 0);
    const dailySpend = getDailyExecutedSpendSince(dailySpendWindowStart.toISOString());
    const openPositions = getOpenPositionsCount();

    const free = Math.max(equitySol - reserves, 0);
    const dailyCap = resolveDailyCap(equitySol);
    const spendRemaining =
      dailyCap === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(dailyCap - dailySpend, 0);

    const snapshot: WalletSnapshot = {
      equity: equitySol,
      free,
      reserves,
      openPositions,
      spendUsed: dailySpend,
      spendRemaining
    };
    this.lastSnapshot = snapshot;
    return snapshot;
  }
}

// legacy loader removed in favor of shared util
