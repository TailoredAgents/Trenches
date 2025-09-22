const fs = require('fs');
const path = require('path');
const { base58 } = require('@scure/base');

const pk = process.env.PHANTOM_PK;
if (!pk || typeof pk !== 'string' || pk.trim().length < 40) {
  console.error('ERROR: PHANTOM_PK env var missing/invalid.');
  process.exit(1);
}

let raw;
try { raw = base58.decode(pk.trim()); }
catch (e) {
  console.error('ERROR: base58 decode failed:', e.message);
  process.exit(1);
}

// Some exports are >64 bytes. Keep the last 64 bytes (Ed25519 secret key).
const secretKey = raw.length >= 64 ? raw.slice(raw.length - 64) : raw;
if (secretKey.length !== 64) {
  console.error(`ERROR: secret key must be 64 bytes, got ${secretKey.length}`);
  process.exit(1);
}

const out = path.resolve(__dirname, 'id.json');
fs.writeFileSync(out, JSON.stringify(Array.from(secretKey)));
console.log('Wrote id.json');

