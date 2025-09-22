import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createLogger } from '@trenches/logger';

const logger = createLogger('executor-wallet');

export class WalletProvider {
  private readonly connection: Connection;
  private readonly keypair: Keypair;
  private readonly disabled: boolean;

  constructor(connection: Connection) {
    this.connection = connection;
    const keypair = tryLoadKeypair();
    if (keypair) {
      this.keypair = keypair;
      this.disabled = false;
    } else {
      this.keypair = Keypair.generate();
      this.disabled = true;
      logger.warn('WALLET_KEYSTORE_PATH not set; executor running in shadow mode');
    }
  }

  get isReady(): boolean {
    return !this.disabled;
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

function tryLoadKeypair(): Keypair | null {
  const keyPath = process.env.WALLET_KEYSTORE_PATH;
  if (!keyPath) {
    return null;
  }
  const resolved = path.resolve(keyPath);
  if (!fs.existsSync(resolved)) {
    logger.warn({ resolved }, 'wallet keystore path missing');
    return null;
  }
  const raw = fs.readFileSync(resolved, 'utf-8').trim();
  try {
    if (raw.startsWith('[')) {
      const bytes = new Uint8Array(JSON.parse(raw));
      return Keypair.fromSecretKey(bytes);
    }
    const values = raw.split(',').map((value) => Number(value.trim()));
    if (values.every((value) => Number.isFinite(value))) {
      return Keypair.fromSecretKey(new Uint8Array(values));
    }
  } catch (err) {
    logger.error({ err }, 'failed to parse wallet key');
  }
  logger.warn('Unsupported keypair format in WALLET_KEYSTORE_PATH');
  return null;
}
