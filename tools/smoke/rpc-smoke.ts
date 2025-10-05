import 'dotenv/config';
import { loadConfig } from '@trenches/config';
import { Connection, SystemProgram } from '@solana/web3.js';

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function httpProbe(connection: Connection): Promise<string> {
  try {
    const { context, value } = await connection.getLatestBlockhashAndContext();
    const slot = context.slot;
    const hash = value.blockhash;
    const prefix = typeof hash === 'string' ? hash.slice(0, 8) : 'unknown';
    return `rpc-http=ok slot=${slot} hash=${prefix}`;
  } catch (err) {
    return `rpc-http=ERR ${formatError(err)}`;
  }
}

async function wsProbe(connection: Connection): Promise<string> {
  let subId: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  let resolved = false;
  let status = 'rpc-ws=ok';

  const finish = async (nextStatus: string): Promise<void> => {
    if (resolved) {
      return;
    }
    resolved = true;
    status = nextStatus;
    if (timer) {
      clearTimeout(timer);
    }
    if (subId !== null) {
      try {
        await connection.removeOnLogsListener(subId);
      } catch {
        // ignore cleanup errors
      }
    }
  };

  try {
    subId = await connection.onLogs(
      SystemProgram.programId,
      async () => {
        await finish('rpc-ws=ok');
      },
      'confirmed'
    );
    timer = setTimeout(() => {
      void finish('rpc-ws=ok');
    }, 5000);
    await new Promise((resolve) => setTimeout(resolve, 5200));
    if (!resolved) {
      await finish('rpc-ws=ok');
    }
    return status;
  } catch (err) {
    await finish(`rpc-ws=ERR ${formatError(err)}`);
    return status;
  }
}

async function fetchJson<T>(url: string, timeoutMs = 3000): Promise<{ ok: boolean; data?: T; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    const data = text.length > 0 ? (JSON.parse(text) as T) : undefined;
    if (!res.ok) {
      return { ok: false, error: `status ${res.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: formatError(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig({ forceReload: true });
  const rpcCfg = cfg.rpc;
  const httpHeaders = rpcCfg.httpHeaders && Object.keys(rpcCfg.httpHeaders).length > 0 ? rpcCfg.httpHeaders : undefined;

  if (!rpcCfg.primaryUrl) {
    console.log('rpc-http=ERR missing_primary_url');
    if (rpcCfg.wsUrl) {
      console.log('rpc-ws=ERR missing_primary_url');
    } else {
      console.log('rpc-ws=skipped');
    }
  } else {
    const connection = new Connection(rpcCfg.primaryUrl, {
      wsEndpoint: rpcCfg.wsUrl,
      httpHeaders
    });
    console.log(await httpProbe(connection));
    if (rpcCfg.wsUrl) {
      console.log(await wsProbe(connection));
    } else {
      console.log('rpc-ws=skipped');
    }
  }

  const agentBase = process.env.NEXT_PUBLIC_AGENT_BASE_URL ?? 'http://127.0.0.1:4010';
  const health = await fetchJson<Record<string, unknown>>(`${agentBase}/healthz`);
  if (health.ok && health.data) {
    const mode = typeof health.data.mode === 'string' ? health.data.mode : 'unknown';
    const controlsEnabled =
      typeof health.data.controlsEnabled === 'boolean' ? health.data.controlsEnabled : 'unknown';
    console.log(`healthz mode=${mode} controlsEnabled=${controlsEnabled}`);
  } else {
    console.log(`healthz ERR ${health.error ?? 'unknown'}`);
  }

  const summary = await fetchJson<Record<string, any>>(`${agentBase}/metrics/summary`);
  if (summary.ok && summary.data) {
    const exec = summary.data.execution ?? {};
    const price = summary.data.price ?? {};
    const landedRate = typeof exec.landedRate === 'number' ? exec.landedRate.toFixed(3) : 'n/a';
    const avgSlip = typeof exec.avgSlipBps === 'number' ? exec.avgSlipBps.toFixed(1) : 'n/a';
    const solUsdAge = typeof price.solUsdAgeSec === 'number' ? price.solUsdAgeSec.toFixed(1) : 'n/a';
    console.log(`summary landedRate=${landedRate} avgSlipBps=${avgSlip} solUsdAgeSec=${solUsdAge}`);
  } else {
    console.log(`summary ERR ${summary.error ?? 'unknown'}`);
  }
}

void main();
