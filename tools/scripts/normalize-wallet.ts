import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

const p = process.env.WALLET_KEYSTORE_PATH || '.dev/wallet.json';
const file = path.resolve(process.cwd(), p);
if (!fs.existsSync(file)) { console.error('missing wallet file', file); process.exit(1); }
const raw = fs.readFileSync(file,'utf8').trim();

let bytes: Uint8Array;
if (raw.startsWith('[')) {
  const arr = JSON.parse(raw) as number[];
  bytes = Uint8Array.from(arr);
} else {
  // base58 fallback
  bytes = bs58.decode(raw);
}

let secret64: Uint8Array;
if (bytes.length === 64) {
  secret64 = bytes;
} else if (bytes.length === 32) {
  secret64 = nacl.sign.keyPair.fromSeed(bytes).secretKey;
} else {
  console.error('unexpected key length', bytes.length);
  process.exit(1);
}

fs.writeFileSync(file, JSON.stringify(Array.from(secret64)));
console.log('WALLET_NORMALIZED', file, 'len=64');

