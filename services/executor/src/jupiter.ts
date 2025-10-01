import fetch from 'node-fetch';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { loadConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';

const logger = createLogger('executor-jupiter');

export type JupiterQuoteRequest = {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps: number;
  onlyDirectRoutes?: boolean;
};

export type JupiterQuoteResponse = {
  outAmount: string;
  priceImpactPct?: number;
  contextSlot: number;
  otherAmountThreshold: string;
  routePlan: unknown[];
};

export type JupiterSwapResponse = {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
};

export class JupiterClient {
  private readonly baseUrl: string;
  private readonly connection: Connection;

  constructor(connection: Connection) {
    const config = loadConfig();
    this.baseUrl = config.rpc.jupiterBaseUrl ?? 'https://quote-api.jup.ag/v6';
    this.connection = connection;
  }

  async fetchQuote(req: JupiterQuoteRequest, userPublicKey: string): Promise<JupiterQuoteResponse> {
    const url = new URL(`${this.baseUrl}/quote`);
    url.searchParams.set('inputMint', req.inputMint);
    url.searchParams.set('outputMint', req.outputMint);
    url.searchParams.set('amount', String(req.amount));
    url.searchParams.set('slippageBps', String(req.slippageBps));
    url.searchParams.set('platformFeeBps', '0');
    if (req.onlyDirectRoutes) {
      url.searchParams.set('onlyDirectRoutes', 'true');
    }
    url.searchParams.set('userPublicKey', userPublicKey);

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Jupiter quote failed ${response.status}`);
    }
    return (await response.json()) as JupiterQuoteResponse;
  }

  async buildSwapTx(params: {
    quoteResponse: JupiterQuoteResponse;
    userPublicKey: string;
    wrapAndUnwrapSol?: boolean;
    computeUnitPriceMicroLamports?: number;
  }): Promise<{ transaction: VersionedTransaction; lastValidBlockHeight: number; prioritizationFeeLamports?: number }> {
    const url = `${this.baseUrl}/swap`; // POST
    const body = {
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true,
      computeUnitPriceMicroLamports: params.computeUnitPriceMicroLamports,
      asLegacyTransaction: false,
      prioritizationFeeLamports: params.quoteResponse.otherAmountThreshold ? undefined : undefined
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`Jupiter swap failed ${response.status}`);
    }
    const payload = (await response.json()) as JupiterSwapResponse;
    const txBuffer = Buffer.from(payload.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    return { transaction, lastValidBlockHeight: payload.lastValidBlockHeight, prioritizationFeeLamports: payload.prioritizationFeeLamports };
  }
}
