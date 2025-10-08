import * as fs from 'fs';
import * as path from 'path';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export type LoadedWallet = {
  ready: boolean;
  reason?: string;
  secretKey?: Uint8Array;
  publicKeyBase58?: string;
  format?: string;
  file?: string;
};

function to64(secretOrSeed: Uint8Array): Uint8Array {
  if (secretOrSeed.length === 64) return secretOrSeed;
  if (secretOrSeed.length === 32) {
    const kp = nacl.sign.keyPair.fromSeed(secretOrSeed);
    return kp.secretKey;
  }
  throw new Error(`unexpected key length: ${secretOrSeed.length}`);
}

function resolveKeystorePath(envPath: string): string | null {
  if (!envPath) return null;
  if (path.isAbsolute(envPath) && fs.existsSync(envPath)) return envPath;
  let dir = process.cwd();
  while (dir.length > 0) {
    const candidate = path.resolve(dir, envPath);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadWalletKeystore(envPath: string): LoadedWallet {
  try {
    if (!envPath) return { ready: false, reason: 'no_path' };
    const file = resolveKeystorePath(envPath);
    if (!file) return { ready: false, reason: 'missing_file' };
    const raw = fs.readFileSync(file, 'utf8').trim();

    let bytes: Uint8Array | null = null;
    let format = 'unknown';

    if (raw.startsWith('[')) {
      const arr = JSON.parse(raw) as number[];
      bytes = Uint8Array.from(arr);
      format = `json_${bytes.length}`;
    } else {
      try {
        const dec = bs58.decode(raw);
        bytes = dec;
        format = `base58_${dec.length}`;
      } catch {
        return { ready: false, reason: 'unrecognized_format', file };
      }
    }

    const secret64 = to64(bytes);
    const pub = nacl.sign.keyPair.fromSecretKey(secret64).publicKey;
    const pub58 = bs58.encode(pub);
    return { ready: true, secretKey: secret64, publicKeyBase58: pub58, format, file };
  } catch (err: any) {
    return { ready: false, reason: `load_error:${err.message}` };
  }
}
