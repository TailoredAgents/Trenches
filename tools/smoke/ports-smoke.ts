import 'dotenv/config';
import { loadConfig } from '@trenches/config';

type Check = {
  label: string;
  port: number;
};

async function probe(port: number, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const checks: Check[] = [
    { label: 'core', port: 4010 },
    { label: 'exec', port: 4011 },
    { label: 'ing', port: 4012 },
    { label: 'disc', port: 4013 },
    { label: 'safe', port: 4014 },
    { label: 'pol', port: 4015 },
    { label: 'pos', port: 4016 },
    { label: 'mig', port: 4018 },
    { label: 'lead', port: 4019 }
  ];
  const pricePortRaw = Number((cfg as any)?.services?.priceUpdater?.port ?? 0);
  if (Number.isFinite(pricePortRaw) && pricePortRaw > 0) {
    checks.push({ label: 'price', port: pricePortRaw });
  }

  const parts: string[] = [];
  for (const check of checks) {
    const ok = await probe(check.port);
    parts.push(`${check.label}=${ok ? 'OK' : 'DOWN'}`);
  }

  console.log(`ports-smoke: ${parts.join(' ')}`);
}

void main();
