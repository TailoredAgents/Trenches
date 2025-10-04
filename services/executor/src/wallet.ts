import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createLogger } from '@trenches/logger';

const logger = createLogger('executor-wallet');

type KeypairLoadResult = { keypair: Keypair | null; reason?: "missing_keystore" | "invalid_format" };

export class WalletProvider {
  private readonly connection: Connection;
  private readonly keypair: Keypair;
  private readonly disabled: boolean;
  private readonly disabledReason: string | null;

  constructor(connection: Connection) {
    this.connection = connection;
    const { keypair, reason } = tryLoadKeypair();
    if (keypair) {
      this.keypair = keypair;
      this.disabled = false;
      this.disabledReason = null;
    } else {
      this.keypair = Keypair.generate();
      this.disabled = true;
      this.disabledReason = reason ?? 'missing_keystore';
      logger.warn({ reason: this.disabledReason }, 'executor wallet unavailable; running in shadow mode');
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

function tryLoadKeypair(): KeypairLoadResult {
  const keyPath = process.env.WALLET_KEYSTORE_PATH;
  if (!keyPath) {
    return { keypair: null, reason: 'missing_keystore' };
  }
  const resolved = path.resolve(keyPath);
  try {
    if (!fs.existsSync(resolved)) {
      logger.warn({ resolved }, 'wallet keystore path missing');
      return { keypair: null, reason: 'missing_keystore' };
    }
    const raw = fs.readFileSync(resolved, 'utf-8').trim();
    if (!raw) {
      logger.warn({ resolved }, 'wallet keystore empty');
      return { keypair: null, reason: 'missing_keystore' };
    }
    if (raw.startsWith('[')) {
      const bytes = new Uint8Array(JSON.parse(raw));
      return { keypair: Keypair.fromSecretKey(bytes) };
    }
    const values = raw.split(',').map((value) => Number(value.trim()));
    if (values.every((value) => Number.isFinite(value))) {
      return { keypair: Keypair.fromSecretKey(new Uint8Array(values)) };
    }
    logger.warn('Unsupported keypair format in WALLET_KEYSTORE_PATH');
    return { keypair: null, reason: 'invalid_format' };
  } catch (err) {
    logger.error({ err, resolved }, 'failed to load wallet keyfile');
    return { keypair: null, reason: 'missing_keystore' };
  }
}
