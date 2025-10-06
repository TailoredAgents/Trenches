import 'dotenv/config';
import { createRpcConnection } from '@trenches/util';

const primaryUrl = process.env.SOLANA_PRIMARY_RPC_URL;

if (!primaryUrl) {
  console.error('SOLANA_PRIMARY_RPC_URL is not set');
  process.exit(1);
}

const connection = createRpcConnection({
  primaryUrl,
  wsUrl: process.env.SOLANA_WS_URL || undefined
});

console.log('createRpcConnection typeof =', typeof createRpcConnection, 'rpcObj?', !!connection);
