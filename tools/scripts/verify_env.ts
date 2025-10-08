import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '@trenches/config';

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error('[verify-env] ' + msg);
  process.exit(1);
}

function warn(msg: string): void {
  // eslint-disable-next-line no-console
  console.warn('[verify-env] ' + msg);
}

async function main(): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  const mode = (env.AGENT_MODE || '').toUpperCase();
  const cfg = loadConfig({ forceReload: true });

  const rpcHttp = cfg.rpc.primaryUrl || '';
  const rpcWs = cfg.rpc.wsUrl || '';
  const jup = cfg.rpc.jupiterBaseUrl || '';
  const walletPath = env.WALLET_KEYSTORE_PATH || env.WALLET_PATH || '';

  // Mode
  if (mode && !['FULL', 'SEMI', 'SHADOW', 'SIM'].includes(mode)) {
    warn(`AGENT_MODE=${mode} unrecognized; using config/default.yaml -> ${cfg.mode}`);
  }

  // Wallet file check (only for live modes)
  const isLive = (mode || cfg.mode) === 'FULL' || (mode || cfg.mode) === 'SEMI';
  if (isLive) {
    if (!walletPath) {
      fail('WALLET_KEYSTORE_PATH is required in FULL/SEMI mode');
    }
    const resolved = path.isAbsolute(walletPath) ? walletPath : path.resolve(process.cwd(), walletPath);
    if (!fs.existsSync(resolved)) {
      fail(`wallet file not found: ${resolved}`);
    }
  }

  // RPC check (HTTP + WS recommended)
  if (!rpcHttp || !/^https?:/i.test(rpcHttp)) {
    const allow = env.NO_RPC === '1' || (mode || cfg.mode) === 'SHADOW' || (mode || cfg.mode) === 'SIM';
    if (!allow) fail('rpc.primaryUrl is missing or not http(s)');
  }
  if (!rpcWs || !/^wss?:/i.test(rpcWs)) {
    warn('rpc.wsUrl missing; websockets are strongly recommended for discovery and watchers');
  }

  // Jupiter API
  if (!jup) warn('rpc.jupiterBaseUrl is empty; default will be used');

  // Optional providers
  if (!process.env.BIRDEYE_API_KEY) warn('BIRDEYE_API_KEY not set (discovery will still work with dexscreener)');

  // eslint-disable-next-line no-console
  console.log('[verify-env] ok: config validated for mode=' + (mode || cfg.mode));
}

main().catch((err) => fail((err as Error).message));
