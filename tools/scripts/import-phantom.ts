import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';

const key = process.env.PHANTOM_BASE58;
if (!key || key.trim().length < 80) {
  console.error('ERR: PHANTOM_BASE58 missing or looks too short.');
  process.exit(1);
}
let raw: Uint8Array;
try {
  raw = bs58.decode(key.trim());
} catch (err) {
  console.error('ERR: failed to decode base58:', (err as Error).message);
  process.exit(1);
}
// Expect ed25519 64-byte secret key (or 32-byte seed; both acceptable—Solana accepts 64-byte secret key array)
if (raw.length !== 64 && raw.length !== 32) {
  console.error(`ERR: decoded length ${raw.length} unexpected (want 64 or 32).`);
  process.exit(1);
}
const outDir = join(process.cwd(), '.dev');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'wallet.json');
writeFileSync(outPath, JSON.stringify(Array.from(raw)));
console.log('WALLET_JSON_WRITTEN', outPath);

