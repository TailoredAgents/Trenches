import 'dotenv/config';

const SERVICES = [
  { name: 'agent-core', port: 4010 },
  { name: 'executor', port: 4011 },
  { name: 'social-ingestor', port: 4012 },
  { name: 'onchain-discovery', port: 4013 },
  { name: 'safety-engine', port: 4014 },
  { name: 'policy-engine', port: 4015 },
  { name: 'position-manager', port: 4016 },
  { name: 'migration-watcher', port: 4018 }
] as const;

type HealthStatus = {
  name: (typeof SERVICES)[number]['name'];
  result: 'OK' | 'DEGRADED';
  detail: string;
};

type MetricsSummary = {
  execution?: { landedRate?: number; avgSlipBps?: number };
  price?: { solUsdAgeSec?: number };
  providers?: Record<string, { state?: string; status?: string; detail?: string; message?: string; error?: string }>;
};

async function fetchJson(url: string, timeoutMs = 2000): Promise<{ ok: boolean; body: unknown; statusCode?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (err) {
      return { ok: false, body: null, statusCode: res.status, error: `invalid JSON: ${(err as Error).message}` };
    }
    if (!res.ok) {
      return { ok: false, body, statusCode: res.status, error: `status ${res.status}` };
    }
    return { ok: true, body, statusCode: res.status };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, body: null, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

function coerceStatus(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  return undefined;
}

function describeDetail(healthBody: unknown): string {
  if (!healthBody || typeof healthBody !== 'object') {
    return 'no_body';
  }
  if ('status' in healthBody && typeof (healthBody as any).status === 'string') {
    return (healthBody as any).status;
  }
  if ('state' in healthBody && typeof (healthBody as any).state === 'string') {
    return (healthBody as any).state;
  }
  return 'unknown';
}

function formatProviders(summary: MetricsSummary | null): string {
  if (!summary?.providers || typeof summary.providers !== 'object') {
    return 'none';
  }
  const parts: string[] = [];
  for (const [name, entry] of Object.entries(summary.providers)) {
    const state = entry?.state ?? entry?.status ?? entry?.detail ?? entry?.message ?? entry?.error ?? 'unknown';
    parts.push(`${name}:${state}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'none';
}

async function main(): Promise<void> {
  const statuses: HealthStatus[] = [];
  const warns: string[] = [];

  for (const svc of SERVICES) {
    const url = `http://127.0.0.1:${svc.port}/healthz`;
    const resp = await fetchJson(url);
    if (!resp.ok) {
      const detail = resp.error ?? 'unreachable';
      statuses.push({ name: svc.name, result: 'DEGRADED', detail });
      warns.push(`${svc.name} healthz ${detail}`);
      continue;
    }
    const body = resp.body;
    const raw = body && typeof body === 'object' ? (body as any).status ?? (body as any).state : undefined;
    const normalized = coerceStatus(raw);
    const ok = normalized === 'ok' || normalized === 'ready';
    const detail = describeDetail(body);
    statuses.push({ name: svc.name, result: ok ? 'OK' : 'DEGRADED', detail });
    if (!ok) {
      warns.push(`${svc.name} status=${detail}`);
    }
  }

  const summaryResp = await fetchJson('http://127.0.0.1:4010/metrics/summary');
  let summary: MetricsSummary | null = null;
  if (!summaryResp.ok) {
    warns.push(`metrics summary ${summaryResp.error ?? summaryResp.statusCode}`);
  } else if (summaryResp.body && typeof summaryResp.body === 'object') {
    summary = summaryResp.body as MetricsSummary;
  } else {
    warns.push('metrics summary empty');
  }

  const landedRate = summary?.execution?.landedRate ?? 0;
  const avgSlip = summary?.execution?.avgSlipBps ?? 0;
  const solUsdAge = summary?.price?.solUsdAgeSec ?? null;
  const providersSummary = formatProviders(summary);

  const statusParts = statuses.map((s) => `${s.name}=${s.result}`);
  const summaryFields = [
    `landedRate=${landedRate.toFixed(3)}`,
    `avgSlipBps=${avgSlip.toFixed(1)}`,
    `solUsdAgeSec=${solUsdAge ?? 'n/a'}`,
    `providers={${providersSummary}}`
  ];
  const summaryPart = `summary={${summaryFields.join(', ')}}`;

  const lineParts = ['healthz:', ...statusParts, summaryPart];
  if (warns.length > 0) {
    lineParts.push(`WARN=${warns.join('|')}`);
  }
  console.log(lineParts.join(' '));
}

void main();
