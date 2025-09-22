const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

const p = path.resolve(__dirname, 'id.json');
if (!fs.existsSync(p)) {
  console.error('id.json not found. Run pk-to-json.js first.');
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
console.log('Public address:', kp.publicKey.toBase58());

