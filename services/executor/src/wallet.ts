import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createLogger } from '@trenches/logger';
import { loadWalletKeystore } from '@trenches/util/wallet';

const logger = createLogger('executor-wallet');

type KeypairLoadResult = { keypair: Keypair | null; reason?: "missing_keystore" | "invalid_format" };

export class WalletProvider {
  private readonly connection: Connection;
  private readonly keypair: Keypair;
  private readonly disabled: boolean;
  private readonly disabledReason: string | null;

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
      logger.warn({ reason: this.disabledReason, file: loaded.file }, 'executor wallet unavailable; running in shadow mode');
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

  get keypairInstance(): Keypair {
    return this.keypair;
  }

  async getBalances(): Promise<{ equity: number; lamports: number }> {
    if (!this.isReady) {
      return { equity: 0, lamports: 0 };
    }
    const balance = await this.connection.getBalance(this.publicKey, 'confirmed');
    return { equity: balance / LAMPORTS_PER_SOL, lamports: balance };
  }
}

// legacy loader removed in favor of shared util
