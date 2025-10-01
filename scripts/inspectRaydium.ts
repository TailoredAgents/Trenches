import { Connection, PublicKey } from '@solana/web3.js';
const url = process.env.SOLANA_PRIMARY_RPC_URL;
if (!url) throw new Error('SOLANA_PRIMARY_RPC_URL missing');
const connection = new Connection(url, 'confirmed');
const RAYDIUM = new PublicKey('675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW');

(async () => {
  const sigs = await connection.getSignaturesForAddress(RAYDIUM, { limit: 100 });
  for (const sig of sigs) {
    const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    const logs = tx?.meta?.logMessages || [];
    if (logs.some((l) => l?.toLowerCase().includes('initialize'))) {
      console.log('---');
      console.log('signature', sig.signature);
      console.log('slot', tx?.slot, 'time', tx?.blockTime);
      console.log('logs', logs);
      console.log('accounts');
      tx?.transaction.message.accountKeys.forEach((k, idx) => console.log(idx, k.toBase58()));
      console.log('meta postTokenBalances', tx?.meta?.postTokenBalances);
      console.log('meta preTokenBalances', tx?.meta?.preTokenBalances);
      break;
    }
  }
})();
