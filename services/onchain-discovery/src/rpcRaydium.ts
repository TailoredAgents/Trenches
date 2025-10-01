import { Connection, PublicKey, LogsCallback } from '@solana/web3.js';
import type { TransactionResponse, VersionedTransactionResponse } from '@solana/web3.js';
import { createLogger } from '@trenches/logger';
import { DiscoveryEventBus } from './eventBus';
import { PoolInitEvent } from './types';
import { lastPoolSlot, raydiumWatcherErrors, raydiumWatcherReconnects } from './metrics';

const logger = createLogger('onchain:rpc-raydium');

const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW');

type RpcWatcherConfig = {
  primaryUrl: string;
  wsUrl?: string;
  httpHeaders?: Record<string, string>;
};

export class RpcRaydiumWatcher {
  private readonly connection: Connection;
  private readonly rpcUrl: string;
  private subscriptionId: number | null = null;
  private stopped = false;
  private backoffMs = 5_000;

  constructor(private readonly bus: DiscoveryEventBus, rpcConfig: RpcWatcherConfig) {
    if (!rpcConfig.primaryUrl) {
      throw new Error('rpc.primaryUrl missing – set SOLANA_PRIMARY_RPC_URL');
    }
    this.rpcUrl = rpcConfig.primaryUrl;
    this.connection = new Connection(this.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: rpcConfig.wsUrl,
      httpHeaders: rpcConfig.httpHeaders
    });
    const socket: any = (this.connection as any)._rpcWebSocket;
    if (socket) {
      socket.on('close', () => this.onWsClose('ws_close'));
      socket.on('error', (err: unknown) => this.onWsClose('ws_error', err));
    }
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.subscribe();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
      } catch (err) {
        this.recordError(err, 'remove_listener');
        logger.error({ err }, 'failed to remove raydium log listener');
      } finally {
        this.subscriptionId = null;
      }
    }
  }

  private async subscribe(): Promise<void> {
    try {
      this.subscriptionId = await this.connection.onLogs(RAYDIUM_PROGRAM_ID, this.handleLogs, 'confirmed');
      logger.info({ endpoint: this.rpcUrl }, 'raydium log subscription established');
      this.backoffMs = 5_000;
    } catch (err) {
      this.recordError(err, 'subscribe');
      logger.error({ err }, 'failed to subscribe to raydium logs');
      await this.restartWithBackoff('subscribe_error');
    }
  }

  private onWsClose(reason: string, err?: unknown) {
    if (this.stopped) return;
    if (err) {
      this.recordError(err, 'ws');
    }
    logger.warn({ reason, err }, 'rpc websocket closed');
    void this.restartWithBackoff(reason);
  }

  private handleLogs: LogsCallback = async (logInfo) => {
    const logs = logInfo.logs || [];
    if (!logs.some((l) => l?.toLowerCase().includes('initialize'))) {
      return;
    }
    try {
      const tx = await this.connection.getTransaction(logInfo.signature, {
        maxSupportedTransactionVersion: 0
      });
      if (!tx) {
        this.recordError(new Error('transaction_missing'), 'fetch_tx');
        return;
      }
      const accounts = this.extractAccountKeys(tx);
      const poolAddress = accounts[0];
      if (!poolAddress) {
        logger.warn({ signature: logInfo.signature }, 'raydium initialize without pool account');
        return;
      }
      const poolCoinAccount = accounts[5];
      const poolPcAccount = accounts[6];
      const resolveMint = (account: string | undefined): string | undefined => {
        if (!account) return undefined;
        const balances = tx.meta?.postTokenBalances ?? [];
        for (const bal of balances) {
          const accountAtIndex = accounts[bal.accountIndex] ?? '';
          if (accountAtIndex === account && bal.mint) {
            return bal.mint;
          }
        }
        return undefined;
      };
      const baseMint = resolveMint(poolCoinAccount);
      const quoteMint = resolveMint(poolPcAccount);
      const timestampMs = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;

      const poolEvent: PoolInitEvent = {
        programId: RAYDIUM_PROGRAM_ID.toBase58(),
        pool: poolAddress,
        baseMint: baseMint ?? undefined,
        quoteMint: quoteMint ?? undefined,
        lpMint: accounts[4],
        poolCoinAccount,
        poolPcAccount,
        timestamp: new Date(timestampMs).toISOString(),
        slot: tx.slot,
        txHash: logInfo.signature
      };

      lastPoolSlot.set(tx.slot);
      this.bus.emitPoolInit(poolEvent);
    } catch (err) {
      this.recordError(err, 'decode');
      logger.error({ err, signature: logInfo.signature }, 'failed to decode raydium initialize');
    }
  };

  private async restartWithBackoff(reason: string): Promise<void> {
    if (this.stopped) return;
    raydiumWatcherReconnects.inc({ reason });
    logger.warn({ backoffMs: this.backoffMs, reason }, 'restarting raydium watcher');
    await new Promise((resolve) => setTimeout(resolve, this.backoffMs));
    this.backoffMs = Math.min(this.backoffMs * 2, 30 * 60 * 1000);
    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
      } catch (err) {
        this.recordError(err, 'remove_listener');
        logger.error({ err }, 'failed to remove existing raydium log listener during restart');
      } finally {
        this.subscriptionId = null;
      }
    }
    await this.subscribe();
  }

  private extractAccountKeys(tx: VersionedTransactionResponse | TransactionResponse): string[] {
    const message = tx.transaction.message as any;
    const keys: string[] = [];
    if (message && Array.isArray(message.accountKeys)) {
      for (const key of message.accountKeys as PublicKey[]) {
        keys.push(key.toBase58());
      }
      return keys;
    }
    if (message && typeof message.getAccountKeys === 'function') {
      try {
        const accountKeys = message.getAccountKeys({
          accountKeysFromLookups: tx.meta?.loadedAddresses
        });
        for (const key of accountKeys.staticAccountKeys as PublicKey[]) {
          keys.push(key.toBase58());
        }
        const lookups = accountKeys.accountKeysFromLookups;
        if (lookups) {
          for (const key of lookups.writable as PublicKey[]) {
            keys.push(key.toBase58());
          }
          for (const key of lookups.readonly as PublicKey[]) {
            keys.push(key.toBase58());
          }
        }
      } catch (err) {
        this.recordError(err, 'resolve_accounts');
        logger.error({ err }, 'failed to resolve account keys');
      }
    }
    return keys;
  }

  private recordError(err: unknown, context: string): void {
    const type = this.classifyError(err);
    raydiumWatcherErrors.inc({ type });
    if (type === 'auth') {
      logger.error({ context }, 'raydium watcher encountered RPC authentication issue');
    }
  }

  private classifyError(err: unknown): string {
    if (!err) return 'unknown';
    if (typeof err === 'number') {
      if (err === 401 || err === 403) return 'auth';
      if (err === 429) return 'rate_limit';
      return 'unknown';
    }
    const error = err as { code?: unknown; message?: unknown };
    const code = typeof error.code === 'string' ? error.code.toUpperCase() : undefined;
    if (code) {
      if (code.includes('401') || code.includes('403') || code === 'AUTHENTICATIONFAILED') {
        return 'auth';
      }
      if (code.startsWith('ECONN') || code === 'ETIMEDOUT') {
        return 'network';
      }
    }
    const message = typeof error.message === 'string' ? error.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes('401') || lower.includes('unauthor') || lower.includes('auth')) {
      return 'auth';
    }
    if (lower.includes('403') || lower.includes('forbidden')) {
      return 'auth';
    }
    if (/timeout|timed out/.test(lower)) {
      return 'timeout';
    }
    if (/429/.test(lower)) {
      return 'rate_limit';
    }
    if (/econnrefused|econnreset|network|fetch failed|not reachable|connection closed/.test(lower)) {
      return 'network';
    }
    return 'unknown';
  }
}
