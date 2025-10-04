import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { getDailySizingSpendSince, getOpenPositionsCount } from '@trenches/persistence';
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
    const { keypair, reason } = tryLoadKeypair();
    if (keypair) {
      this.keypair = keypair;
      this.disabled = false;
      this.disabledReason = null;
    } else {
      this.keypair = Keypair.generate();
      this.disabled = true;
      this.disabledReason = reason ?? 'missing_keystore';
      logger.warn({ reason: this.disabledReason }, 'policy engine wallet unavailable; running in shadow mode');
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
    if (!this.isReady) {
      const snapshot: WalletSnapshot = {
        equity: 0,
        free: 0,
        reserves: config.wallet.reservesSol,
        openPositions: 0,
        spendUsed: 0,
        spendRemaining: config.wallet.dailySpendCapSol
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
    const dailySpend = getDailySizingSpendSince(dailySpendWindowStart.toISOString());
    const openPositions = getOpenPositionsCount();

    const free = Math.max(equitySol - reserves, 0);
    const spendRemaining = Math.max(config.wallet.dailySpendCapSol - dailySpend, 0);

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

function tryLoadKeypair(): KeypairLoadResult {
  const keyPath = process.env.WALLET_KEYSTORE_PATH;
  if (!keyPath) {
    return { keypair: null, reason: 'missing_keystore' };
  }
  const absolutePath = path.resolve(keyPath);
  try {
    if (!fs.existsSync(absolutePath)) {
      logger.warn({ absolutePath }, 'wallet keystore path missing');
      return { keypair: null, reason: 'missing_keystore' };
    }
    const raw = fs.readFileSync(absolutePath, 'utf-8').trim();
    if (!raw) {
      logger.warn({ absolutePath }, 'wallet keystore empty');
      return { keypair: null, reason: 'missing_keystore' };
    }
    if (raw.startsWith('[')) {
      const secret = new Uint8Array(JSON.parse(raw));
      return { keypair: Keypair.fromSecretKey(secret) };
    }
    const bytes = raw.split(',').map((part) => Number(part.trim()));
    if (bytes.every((value) => Number.isFinite(value))) {
      return { keypair: Keypair.fromSecretKey(new Uint8Array(bytes)) };
    }
    logger.warn('Unsupported keypair format in WALLET_KEYSTORE_PATH');
    return { keypair: null, reason: 'invalid_format' };
  } catch (err) {
    logger.error({ err, absolutePath }, 'failed to load wallet keystore');
    return { keypair: null, reason: 'missing_keystore' };
  }
}
