import { Commitment, Connection, ConnectionConfig } from '@solana/web3.js';

export interface RpcConnectionConfig {
  primaryUrl: string;
  wsUrl?: string;
  httpHeaders?: Record<string, string>;
}

export interface RpcConnectionOptions {
  commitment?: Commitment;
}

export function createRpcConnection(
  config: RpcConnectionConfig,
  options: RpcConnectionOptions = {}
): Connection {
  if (!config.primaryUrl) {
    throw new Error('RPC primary URL is required');
  }
  const connectionConfig: ConnectionConfig = {
    commitment: options.commitment ?? 'confirmed',
    wsEndpoint: config.wsUrl,
    httpHeaders: config.httpHeaders && Object.keys(config.httpHeaders).length > 0 ? config.httpHeaders : undefined
  };
  return new Connection(config.primaryUrl, connectionConfig);
}
