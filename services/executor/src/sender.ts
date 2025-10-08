import bs58 from 'bs58';
import { Connection, VersionedTransaction, Commitment } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';
import { ordersFailed, ordersSubmitted, fillsRecorded, lastLatencyMs, jitoUsageGauge } from './metrics';

const logger = createLogger('executor-sender');

export type SendOptions = {
  commitment?: Commitment;
  maxRetries?: number;
};

export class TransactionSender {
  constructor(private readonly connection: Connection) {}

  async sendAndConfirm(opts: {
    transaction: VersionedTransaction;
    jitoTipLamports?: number;
    jitoTipTxBase64?: string | null;
    computeUnitPriceMicroLamports?: number;
    label: string;
  }): Promise<{ signature: string; slot: number }> {
    const start = Date.now();
    const tipBase64 = opts.jitoTipTxBase64 ?? null;
    const tipLamports = opts.jitoTipLamports ?? 0;
    const config = loadConfig();
    const jitoUrl = config.rpc.jitoHttpUrl;
    const jitoEnabled = Boolean((config.execution as any)?.jitoEnabled && jitoUrl);

    if (jitoEnabled) {
      try {
        const extraTxs = tipBase64 ? [tipBase64] : undefined;
        const jitoResult = await this.sendViaJito(opts.transaction, jitoUrl!, extraTxs);
        ordersSubmitted.inc();
        jitoUsageGauge.inc();
        fillsRecorded.inc();
        lastLatencyMs.set(Date.now() - start);
        return { signature: jitoResult.signature, slot: jitoResult.slot };
      } catch (err) {
        ordersFailed.inc({ stage: 'jito' });
        logger.warn({ err }, 'Jito send failed; falling back to primary RPC path');
      }
    }

    try {
      if (tipBase64 && tipLamports > 0) {
        await this.trySendTip(Buffer.from(tipBase64, 'base64'));
      }
      const signature = await this.sendPrimary(opts.transaction);
      ordersSubmitted.inc();
      const confirmation = await this.connection.confirmTransaction(
        {
          signature,
          ...(await this.connection.getLatestBlockhash())
        },
        'confirmed'
      );
      if (confirmation.value.err) {
        throw new Error(`transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      const slot = confirmation.context.slot;
      fillsRecorded.inc();
      lastLatencyMs.set(Date.now() - start);
      return { signature, slot };
    } catch (primaryErr) {
      ordersFailed.inc({ stage: 'primary' });
      logger.error({ err: primaryErr }, 'primary send failed');
      throw primaryErr;
    }
  }

  private async sendPrimary(transaction: VersionedTransaction): Promise<string> {
    const signature = await this.connection.sendTransaction(transaction, {
      maxRetries: 3,
      skipPreflight: false
    });
    return signature;
  }

  private async sendViaJito(transaction: VersionedTransaction, jitoUrl: string, extraTransactionsBase64?: string[]): Promise<{ signature: string; slot: number }> {
    const serialized = Buffer.from(transaction.serialize());
    const bundleTransactions = [...(extraTransactionsBase64 ?? []), serialized.toString('base64')];
    const bundle = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [bundleTransactions]
    };
    const response = await fetch(jitoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bundle)
    });
    if (!response.ok) {
      throw new Error(`Jito send failed ${response.status}`);
    }
    const payload = (await response.json()) as { result?: { bundleId: string } };
    if (!payload.result?.bundleId) {
      throw new Error('Jito response missing bundleId');
    }
        const signatureBytes = transaction.signatures[0];
    const signature = bs58.encode(signatureBytes);
    const latestBlockhash = await this.connection.getLatestBlockhash();
    const confirmation = await this.connection.confirmTransaction(
      {
        signature,
        ...latestBlockhash
      },
      'confirmed'
    );
    if (confirmation.value.err) {
      throw new Error(`Jito bundle failed ${JSON.stringify(confirmation.value.err)}`);
    }
    return { signature, slot: confirmation.context.slot };
  }

  private async trySendTip(rawTransaction: Buffer): Promise<void> {
    try {
      const signature = await this.connection.sendRawTransaction(rawTransaction, {
        maxRetries: 2,
        skipPreflight: false
      });
      const latestBlockhash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({ signature, ...latestBlockhash }, 'confirmed');
      logger.debug({ signature }, 'tip transaction sent');
    } catch (err) {
      logger.warn({ err }, 'failed to send tip transaction');
    }
  }
}
