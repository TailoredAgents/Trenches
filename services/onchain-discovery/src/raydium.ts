import { createClient, Client, SubscribePayload, Sink } from 'graphql-ws';
import WebSocket from 'ws';
import { createLogger } from '@trenches/logger';
import { getConfig } from '@trenches/config';
import { DiscoveryEventBus } from './eventBus';
import { PoolInitEvent } from './types';

const logger = createLogger('onchain:raydium');

const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW';

const SUBSCRIPTION_QUERY = /* GraphQL */ `
  subscription RaydiumPoolInit {
    SolanaWeb3Subscribe(
      network: solana
      subscription: {
        instruction: {
          programId: "${RAYDIUM_PROGRAM_ID}"
          innerInstruction: false
          data: [
            { at: 0, op: EQ, bytes: "initialize2" }
          ]
        }
      }
    ) {
      txHash
      timestamp
      slot
      instructionAccountList
    }
  }
`;

type RaydiumPayload = {
  data?: {
    SolanaWeb3Subscribe?: {
      txHash: string;
      timestamp: string;
      slot: number;
      instructionAccountList: Array<{ account: string }>;
    };
  };
};

export class RaydiumWatcher {
  private client?: Client;
  private unsubscribe?: () => void;
  private stopped = false;

  constructor(private readonly bus: DiscoveryEventBus) {}

  async start(): Promise<void> {
    const cfg = getConfig();
    const url = cfg.dataProviders.bitqueryWsUrl;
    const apiKey = process.env.BITQUERY_API_KEY;
    if (!apiKey) {
      logger.warn('missing BITQUERY_API_KEY, raydium watcher idle');
      return;
    }
    this.stopped = false;
    this.client = createClient({
      url,
      webSocketImpl: WebSocket,
      connectionParams: {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey
        }
      },
      lazy: false,
    });
    const payload: SubscribePayload = { query: SUBSCRIPTION_QUERY };
    this.unsubscribe = this.client.subscribe(payload, this.createSink());
    logger.info('raydium watcher subscribed');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.unsubscribe) {
      try {
        this.unsubscribe();
      } catch (err) {
        logger.error({ err }, 'error unsubscribing raydium watcher');
      }
      this.unsubscribe = undefined;
    }
    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client?.dispose();
        resolve();
      });
      this.client = undefined;
    }
  }

  private createSink(): Sink<RaydiumPayload> {
    return {
      next: (payload) => {
        const data = payload.data?.SolanaWeb3Subscribe;
        if (!data) return;
        const accounts = data.instructionAccountList ?? [];
        const poolEvent: PoolInitEvent = {
          programId: RAYDIUM_PROGRAM_ID,
          pool: accounts[4]?.account ?? accounts[0]?.account ?? 'unknown',
          baseMint: undefined,
          quoteMint: undefined,
          timestamp: data.timestamp,
          slot: data.slot,
          txHash: data.txHash
        };
        logger.debug({ pool: poolEvent.pool, tx: poolEvent.txHash }, 'raydium pool init');
        this.bus.emitPoolInit(poolEvent);
      },
      error: (err) => {
        logger.error({ err }, 'raydium subscription error');
        if (!this.stopped) {
          setTimeout(() => void this.restart(), 5_000);
        }
      },
      complete: () => {
        logger.warn('raydium subscription completed');
        if (!this.stopped) {
          setTimeout(() => void this.restart(), 5_000);
        }
      }
    };
  }

  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}

