"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentSnapshot, AgentEvent, AgentMode, AgentMetricsSummary } from './types';

import { createInMemoryLastEventIdStore, createSSEClient } from '@trenches/util';

const SNAPSHOT_INTERVAL_MS = 5000;
const MAX_EVENTS = 50;

const MODES: AgentMode[] = ['SIM', 'SHADOW', 'SEMI', 'FULL'];

function useAgentSnapshot(baseUrl: string) {
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSnapshot() {
      try {
        const resp = await fetch(`${baseUrl}/snapshot`, { cache: 'no-store' });
        if (!resp.ok) {
          throw new Error(`${resp.status} ${resp.statusText}`);
        }
        const json = (await resp.json()) as AgentSnapshot;
        if (!cancelled) {
          setSnapshot(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      }
    }

    fetchSnapshot();
    const timer = setInterval(fetchSnapshot, SNAPSHOT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [baseUrl]);

  return { snapshot, error };
}

function useAgentEvents(baseUrl: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');

  useEffect(() => {
    let isActive = true;
    setStatus('connecting');
    const store = createInMemoryLastEventIdStore();
    const client = createSSEClient(`${baseUrl}/events/agent`, {
      lastEventIdStore: store,
      onOpen: () => {
        if (!isActive) return;
        setStatus('open');
      },
      onError: () => {
        if (!isActive) return;
        setStatus('connecting');
      },
      onEvent: (evt) => {
        if (!isActive || !evt?.data || evt.data === 'ping') {
          return;
        }
        try {
          const payload = JSON.parse(evt.data);
          setEvents((prev) => {
            const next: AgentEvent[] = [
              { at: new Date().toISOString(), type: (payload && payload.t) || 'message', payload },
              ...prev
            ];
            return next.slice(0, MAX_EVENTS);
          });
        } catch {
          // ignore malformed payloads
        }
      }
    });
    return () => {
      isActive = false;
      client.dispose();
    };
  }, [baseUrl]);

  return { events, status };
}

function formatNumber(value: number | undefined, fractionDigits = 2) {
  if (value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits
  });
}

function formatPercent(value: number | undefined) {
  if (value === undefined) {
    return '-';
  }



  return `${(value * 100).toFixed(1)}%`;
}

function formatAgo(ts?: number | null) {
  if (typeof ts !== 'number' || Number.isNaN(ts)) {
    return '—';
  }
  const ageSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (ageSec < 60) {
    return `${ageSec}s ago`;
  }
  if (ageSec < 3600) {
    return `${Math.floor(ageSec / 60)}m ago`;
  }
  const hours = Math.floor(ageSec / 3600);
  return `${hours}h ago`;
}

type RouteQualityRow = {
  route: string;
  attempts: number;
  fails: number;
  failRate: number;
  avgSlipRealBps: number;
  avgSlipExpBps: number;
  penalty: number;
  excluded: boolean;
};


function ModeBadge({ mode }: { mode?: AgentMode }) {
  const label = mode ?? 'SIM';
  return <span className="badge">Mode: {label}</span>;
}

export default function Dashboard({ agentBaseUrl }: { agentBaseUrl: string }) {
  const { snapshot, error } = useAgentSnapshot(agentBaseUrl);
  const { events, status: eventStreamStatus } = useAgentEvents(agentBaseUrl);
  const [health, setHealth] = useState<Record<string, { status: number | string; body?: any; error?: string }> | null>(null);
  const [metrics, setMetrics] = useState<{
    exposureSol?: number;
    exits?: Record<string, number>;
    trailing?: number;
    opened?: number;
    apiRpm?: {
      social?: Record<string, number>;
      dexscreener?: number;
      birdeye?: number;
      dexscreenerTypes?: Record<string, number>;
      birdeyeTypes?: Record<string, number>;
    };
    execution?: { presetActive?: boolean; presetUsesTotal?: number };
  } | null>(null);
  const [summary, setSummary] = useState<AgentMetricsSummary | null>(null);
  const [routeQuality, setRouteQuality] = useState<RouteQualityRow[]>([]);
  const [routeQualityWindow, setRouteQualityWindow] = useState<number | null>(null);
  const [policy, setPolicy] = useState<{ congestion?: string } | null>(null);
  const [exposureHist, setExposureHist] = useState<number[]>([]);
  const [dexHist, setDexHist] = useState<number[]>([]);
  const [beHist, setBeHist] = useState<number[]>([]);
  const [socHist, setSocHist] = useState<number[]>([]);
  useEffect(() => {
    let cancelled = false;
    const intervalMs = 10000;
    async function load() {
      try {
        const resp = await fetch(`${agentBaseUrl}/metrics/summary`, { cache: 'no-store' });
        if (!resp.ok) {
          throw new Error(`${resp.status} ${resp.statusText}`);
        }
        const json = (await resp.json()) as AgentMetricsSummary;
        if (!cancelled) {
          setSummary(json);
        }
      } catch {
        if (!cancelled) {
          // retain last good summary when endpoint is unavailable
        }
      }
    }
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [agentBaseUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/metrics', { cache: 'no-store' });
        const j = (await r.json()) as {
          exposureSol?: number;
          exits?: Record<string, number>;
          trailing?: number;
          opened?: number;
          apiRpm?: { social?: Record<string, number>; dexscreener?: number; birdeye?: number };
          execution?: { presetActive?: boolean; presetUsesTotal?: number };
        };
        if (!cancelled) {
          setMetrics(j as any);
          const dex = j.apiRpm?.dexscreener ?? 0;
          const be = j.apiRpm?.birdeye ?? 0;
          const soc = j.apiRpm?.social ? Object.values(j.apiRpm.social).reduce((a, b) => a + b, 0) : 0;
          setDexHist((prev) => [...prev.slice(-19), dex]);
          setBeHist((prev) => [...prev.slice(-19), be]);
          setSocHist((prev) => [...prev.slice(-19), soc]);
        }
      } catch (err) { /* ignore */ }
    }
    load();
    const t = setInterval(load, 7000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('http://127.0.0.1:4011/route-quality', { cache: 'no-store' });
        if (!r.ok) {
          throw new Error(`${r.status} ${r.statusText}`);
        }
        const j = (await r.json()) as { windowStart?: number; rows?: RouteQualityRow[] };
        if (!cancelled) {
          setRouteQuality(Array.isArray(j.rows) ? j.rows : []);
          setRouteQualityWindow(typeof j.windowStart === 'number' ? j.windowStart : null);
        }
      } catch {
        if (!cancelled) {
          setRouteQuality([]);
          setRouteQualityWindow(null);
        }
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        const j = (await r.json()) as Record<string, { status: number | string; body?: any; error?: string }>;
        if (!cancelled) setHealth(j);
      } catch (err) { /* ignore */ }
    }
    load();
    const t = setInterval(load, 7000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const migrations = snapshot?.latestMigrations ?? [];
  const lag = snapshot?.migrationLag;
  const rug = snapshot?.rugGuard;
  const exec = (summary?.execution ?? snapshot?.execution) as any;
  const priceInfo = (summary?.price ?? snapshot?.pnl?.prices) as { solUsdAgeSec?: number | null; ok?: boolean } | undefined;
  const providersData = (summary?.providers ?? ((snapshot as any)?.providers as Record<string, any> | undefined));
  const providerCacheSummary = summary?.discovery?.providerCache;
  const risk = (snapshot as any)?.riskBudget as any;
  const sizingTop = (snapshot as any)?.sizing?.topArms as Array<{ arm: string; share: number }> | undefined;
  const surv = (snapshot as any)?.survival as any;
  const bt = (snapshot as any)?.backtest as any;
  const sh = (snapshot as any)?.shadow as any;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/metrics', { cache: 'no-store' });
        const j = (await r.json()) as {
          exposureSol?: number;
          exits?: Record<string, number>;
          trailing?: number;
          opened?: number;
          apiRpm?: {
            social?: Record<string, number>;
            dexscreener?: number;
            birdeye?: number;
            dexscreenerTypes?: Record<string, number>;
            birdeyeTypes?: Record<string, number>;
          };
          execution?: { presetActive?: boolean; presetUsesTotal?: number };
        };
        if (!cancelled) setMetrics(j);
      } catch (err) { /* ignore */ }
    }
    load();
    const t = setInterval(load, 7000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Poll metrics (also builds simple histories for sparklines)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/metrics', { cache: 'no-store' });
        const j = (await r.json()) as {
          exposureSol?: number;
          exits?: Record<string, number>;
          trailing?: number;
          opened?: number;
          apiRpm?: { social?: Record<string, number>; dexscreener?: number; birdeye?: number };
          execution?: { presetActive?: boolean; presetUsesTotal?: number };
        };
        if (!cancelled) {
          setMetrics(j as any);
          const exp = typeof j.exposureSol === 'number' ? j.exposureSol : 0;
          const dex = j.apiRpm?.dexscreener ?? 0;
          const be = j.apiRpm?.birdeye ?? 0;
          const soc = j.apiRpm?.social ? Object.values(j.apiRpm.social).reduce((a, b) => a + b, 0) : 0;
          setExposureHist((prev) => [...prev.slice(-29), exp]);
          setDexHist((prev) => [...prev.slice(-29), dex]);
          setBeHist((prev) => [...prev.slice(-29), be]);
          setSocHist((prev) => [...prev.slice(-29), soc]);
        }
      } catch (err) { /* ignore */ }
    }
    load();
    const t = setInterval(load, 7000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const maxExposure = Math.max(1, ...exposureHist);
  const exposureLast = exposureHist.length > 0 ? exposureHist[exposureHist.length - 1] : undefined;
  const exposurePrev = exposureHist.length > 1 ? exposureHist[exposureHist.length - 2] : undefined;
  const exposureDelta =
    typeof exposureLast === 'number' && typeof exposurePrev === 'number' ? exposureLast - exposurePrev : undefined;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/policy', { cache: 'no-store' });
        const j = (await r.json()) as { congestion?: string };
        if (!cancelled) setPolicy(j);
      } catch (err) { /* ignore */ }
    }
    load();
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const candidates = snapshot?.candidates ?? [];
  const topics = snapshot?.topics ?? [];
  const positions = snapshot?.positions ?? [];
  const leaderData = snapshot?.leader;
  const leaderHits = leaderData?.recentHits ?? [];
  const leaderTopWallets = leaderData?.topWallets ?? [];

  const congestion = policy?.congestion ?? 'unknown';

  function congestionToPct(level: string): number {
    switch ((level || '').toLowerCase()) {
      case 'p25':
        return 0.25;
      case 'p50':
        return 0.5;
      case 'p75':
        return 0.75;
      case 'p90':
        return 0.9;
      default:
        return 0.0;
    }
  }

  const [token, setToken] = useState<string>(
    (typeof window !== 'undefined' && localStorage.getItem('trenches_token')) || ''
  );
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('trenches_token', token);
    }
  }, [token]);

  const controlsDisabled = false;
  const authHeaders = useMemo<Record<string, string>>(
    () => (token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>)),
    [token]
  );

  const handleModeChange = useCallback(
    async (mode: AgentMode) => {
      try {
        const resp = await fetch(`${agentBaseUrl}/control/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
          body: JSON.stringify({ mode })
        });
        if (!resp.ok) throw new Error(`${resp.status}`);
      } catch (err) {
        console.error('Mode change failed', err);
      }
    },
    [agentBaseUrl, authHeaders]
  );

  const handlePause = useCallback(async () => {
    try {
      const resp = await fetch(`${agentBaseUrl}/control/pause`, { method: 'POST', headers: authHeaders as HeadersInit });
      if (!resp.ok) throw new Error(`${resp.status}`);
    } catch (err) {
      console.error('Pause failed', err);
    }
  }, [agentBaseUrl, authHeaders]);

  const handleResume = useCallback(async () => {
    try {
      const resp = await fetch(`${agentBaseUrl}/control/resume`, { method: 'POST', headers: authHeaders as HeadersInit });
      if (!resp.ok) throw new Error(`${resp.status}`);
    } catch (err) {
      console.error('Resume failed', err);
    }
  }, [agentBaseUrl, authHeaders]);

  const handleFlatten = useCallback(async () => {
    try {
      const resp = await fetch(`${agentBaseUrl}/control/flatten`, { method: 'POST', headers: authHeaders as HeadersInit });
      if (!resp.ok) throw new Error(`${resp.status}`);
    } catch (err) {
      console.error('Flatten failed', err);
    }
  }, [agentBaseUrl, authHeaders]);

  return (
    <div className="grid grid-columns" style={{ gap: '32px' }}>
      <section className="card" style={{ gridColumn: 'span 12 / span 12' }}>
        <div className="banner">
          <div>
            <h1>Trenches Command Center</h1>
            <p>Snapshot and live events. Use the token to enable controls.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <ModeBadge mode={undefined} />
            <span className="badge">SSE: {eventStreamStatus}</span>
            <input
              className="input"
              placeholder="Auth token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn" disabled={controlsDisabled} onClick={handlePause}>
              Pause
            </button>
            <button className="btn" disabled={controlsDisabled} onClick={handleResume}>
              Resume
            </button>
            <button className="btn warn" disabled={controlsDisabled} onClick={handleFlatten}>
              Flatten
            </button>
            <div className="btn-group">
              {MODES.map((m) => (
                <button key={m} className="btn" disabled={controlsDisabled} onClick={() => handleModeChange(m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error ? <div className="empty-state" style={{ marginTop: 16 }}>Snapshot unavailable: {error}</div> : null}
      </section>

      <section className="card" style={{ gridColumn: 'span 8 / span 8' }}>
        <h2>Social Radar</h2>
        <small>Live candidates (last {candidates.length} entries)</small>
        {candidates.length === 0 ? (
          <div className="empty-state">No candidates observed yet. Waiting for upstream feeds.</div>
        ) : (
          <div className="list">
            {candidates.map((cand) => (
              <div key={cand.mint} className="list-item">
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{cand.name}</strong>
                    {cand.leaderBoostEligible ? (
                      <span className="chip" style={{ background: '#10b981', color: '#0f172a' }}>leader-hit</span>
                    ) : null}
                  </div>
                  <div style={{ color: '#9aa5c4', fontSize: 12 }}>Mint: {cand.mint}</div>
                  {cand.pool ? (
                    <div style={{ color: '#9aa5c4', fontSize: 12 }}>Pool: {cand.pool}</div>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right', minWidth: 180 }}>
                  
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>{cand.buys} buys / {cand.sells} sells / uniques {cand.uniques}</div>
                  {cand.leaderHits && cand.leaderHits > 0 ? (
                    <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>Leader hits: {cand.leaderHits}</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Watch Windows</h2>
        <small>Active narrative topics ({topics.length})</small>
        {topics.length === 0 ? (
          <div className="empty-state">No active windows. Narrative miner idle or awaiting feeds.</div>
        ) : (
          <div className="list">
            {topics.map((topic) => (
              <div key={topic.topicId} className="list-item">
                <div>
                  <strong>{topic.label}</strong>
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>Window: {topic.secondsLeft}s</div>
                </div>
                <div className="chip">SSS {formatNumber(topic.sss, 2)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 8 / span 8' }}>
        <h2>Positions</h2>
        <small>Open positions with ladder targets</small>
        {positions.length === 0 ? (
          <div className="empty-state">No open positions. Awaiting fills.</div>
        ) : (
          <div className="list">
            {positions.map((pos) => (
              <div key={pos.mint} className="list-item">
                <div>
                  <strong>
                    {pos.mint.slice(0, 4)}...{pos.mint.slice(-4)}
                  </strong>
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>
                    Qty {formatNumber(pos.qty)} @ {formatNumber(pos.avg)} SOL
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={pos.upl >= 0 ? 'chip' : 'chip alert'} style={{ marginBottom: 6 }}>
                    UPL {formatNumber(pos.upl, 2)} SOL
                  </div>
                  <div style={{ fontSize: 12 }}>Targets: {pos.targets.map((t) => `${t}%`).join(', ') || '-'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Risk & Health</h2>
        <div className="health-grid">
          <div className="health-card">
            <header>
              <span>Exposure</span>
              <div className="sparkline" style={{ display: 'flex', gap: 2, height: 24, alignItems: 'flex-end' }}>
                {exposureHist.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#9aa5c4' }}>no data</span>
                ) : (
                  exposureHist.map((v, idx) => {
                    const h = Math.max(2, Math.min(24, Math.round((v / maxExposure) * 24)));
                    return <span key={idx} style={{ width: 3, height: h, background: '#94a3b8', display: 'inline-block' }} />;
                  })
                )}
              </div>
            </header>
            <strong>{formatNumber(metrics?.exposureSol, 2)} SOL</strong>
            <div style={{ fontSize: 12, color: exposureDelta ? (exposureDelta > 0 ? '#10b981' : '#f43f5e') : '#9aa5c4' }}>
              {exposureDelta === undefined ? 'â€”' : `${exposureDelta > 0 ? '+' : ''}${formatNumber(exposureDelta, 2)} since last`}
            </div>
          </div>
          <div className="health-card">
            <header>
              <span>Daily Loss Cap</span>
              <span style={{ fontSize: 12 }}>{formatPercent(snapshot?.risk?.dailyLossPct)}</span>
            </header>
            <div className="metric-value">{formatNumber(snapshot?.sizing?.base, 2)} SOL</div>
          </div>
          <div className="health-card">
            <header>
              <span>Congestion</span>
              <span className="chip">{congestion}</span>
            </header>
            <div className="metric-value">{formatNumber(snapshot?.sizing?.final, 2)} SOL</div>
            <div style={{ marginTop: 8, height: 8, background: '#1f2a4d', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.round(congestionToPct(congestion) * 100)}%`,
                  height: '100%',
                  background: '#f59e0b',
                  transition: 'width 200ms ease'
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#9aa5c4', marginTop: 6 }}>
              Tip guide: p25 200â€“400k, p50 500kâ€“1M, p75 1.5â€“2.5M, p90 3â€“4M
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 8 / span 8' }}>
        <h2>Recent Migrations</h2>
        <small>Latest {migrations.length} (p50 {formatNumber(lag?.p50, 0)} ms / p95 {formatNumber(lag?.p95, 0)} ms)</small>
        {migrations.length === 0 ? (
          <div className="empty-state">No migrations observed.</div>
        ) : (
          <div className="list">
            {migrations.map((m, i) => (
              <div key={i} className="list-item">
                <div>
                  <strong>{m.source}</strong>
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>Mint: {m.mint.slice(0, 4)}...{m.mint.slice(-4)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12 }}>{new Date(m.ts).toLocaleTimeString()}</div>
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>Pool: {m.pool.slice(0, 4)}...{m.pool.slice(-4)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>RugGuard</h2>
        <div className="metric-grid">
          <div className="metric-tile">
            <span>Authority Pass</span>
            <div className="metric-value">{rug ? formatNumber(rug.passRate * 100, 1) : '-'}%</div>
          </div>
          <div className="metric-tile">
            <span>Avg RugProb</span>
            <div className="metric-value">{rug ? formatNumber(rug.avgRugProb, 2) : '-'}</div>
          </div>
        </div>
      </section>
      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Route Quality (24h)</h2>
        {routeQualityWindow ? (
          <small style={{ display: 'block', color: '#9aa5c4' }}>
            Window start: {new Date(routeQualityWindow).toLocaleString()}
          </small>
        ) : null}
        {routeQuality.length === 0 ? (
          <div className="empty-state">No route stats yet.</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #1f2a4d' }}>
                  <th style={{ padding: '4px 8px' }}>Route</th>
                  <th style={{ padding: '4px 8px' }}>Attempts</th>
                  <th style={{ padding: '4px 8px' }}>Fail %</th>
                  <th style={{ padding: '4px 8px' }}>Avg Slip</th>
                  <th style={{ padding: '4px 8px' }}>Penalty</th>
                  <th style={{ padding: '4px 8px' }}>Excluded</th>
                </tr>
              </thead>
              <tbody>
                {routeQuality.map((row) => (
                  <tr key={row.route} style={{ color: row.excluded ? '#f87171' : undefined }}>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{row.route}</td>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{formatNumber(row.attempts, 0)}</td>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{formatNumber(row.failRate * 100, 1)}%</td>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{formatNumber(row.avgSlipRealBps, 1)} bps</td>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{formatNumber(row.penalty, 1)}</td>
                    <td style={{ padding: '4px 8px', borderTop: '1px solid #1f2a4d' }}>{row.excluded ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>


      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Execution
          {metrics?.execution?.presetActive ? (
            <span className="badge" style={{ fontSize: 11 }}>Preset Active</span>
          ) : null}
          {typeof priceInfo?.solUsdAgeSec === 'number' ? (
            priceInfo?.ok ? (
              <span className="badge" style={{ fontSize: 11 }}>Price: OK</span>
            ) : (
              <span className="badge" style={{ fontSize: 11 }}>
                Price: Stale ({Math.floor(((priceInfo?.solUsdAgeSec ?? 0) / 60))}m)
              </span>
            )
          ) : null}
        </h2>
        <div className="metric-grid">
          <div className="metric-tile">
            <span>Landed Rate</span>
            <div className="metric-value">{exec ? formatNumber(exec.landedRate * 100, 1) : '-'}%</div>
          </div>
          <div className="metric-tile">
            <span>Avg Slip</span>
            <div className="metric-value">{exec ? formatNumber(exec.avgSlipBps, 1) : '-'} bps</div>
          </div>
          <div className="metric-tile">
            <span>p50 TTL</span>
            <div className="metric-value">{exec ? formatNumber(exec.p50Ttl, 0) : '-'} ms</div>
          </div>
          <div className="metric-tile">
            <span>p95 TTL</span>
            <div className="metric-value">{exec ? formatNumber(exec.p95Ttl, 0) : '-'} ms</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Risk Budget</h2>
        <div className="metric-grid">
          <div className="metric-tile">
            <span>Daily Cap</span>
            <div className="metric-value">{formatNumber(risk?.dailyLossCapUsd, 0)} USD</div>
          </div>
          <div className="metric-tile">
            <span>Used</span>
            <div className="metric-value">{formatNumber(risk?.usedUsd, 0)} USD</div>
          </div>
          <div className="metric-tile">
            <span>Remaining</span>
            <div className="metric-value">{formatNumber(risk?.remainingUsd, 0)} USD</div>
          </div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Providers</h2>
        <div className="list">
          {(() => {
            const prov = providersData;
            if (!prov || Object.keys(prov).length === 0) {
              return <div className="empty-state">No provider data.</div>;
            }
            const entries = Object.entries(prov);
            return (
              <>
                {entries.map(([name, st]) => {
                  const details = (st as Record<string, any>) ?? {};
                  const state = (details.state ?? details.status) as string | undefined;
                  const ok = name === 'birdeye'
                    ? Boolean(details.apiKey ?? (state === 'configured'))
                    : state ? ['running', 'ok', 'configured'].includes(state) : false;
                  const candidates: Array<number | undefined> = [];
                  if (typeof details.lastSuccessTs === 'number') candidates.push(details.lastSuccessTs);
                  if (typeof details.lastPollTs === 'number') candidates.push(details.lastPollTs);
                  if (typeof details.lastEventTs === 'number') candidates.push(details.lastEventTs);
                  if (typeof details.lastSuccessAt === 'string') {
                    const parsed = Date.parse(details.lastSuccessAt);
                    if (!Number.isNaN(parsed)) candidates.push(parsed);
                  }
                  let lastTs = candidates.find((ts) => typeof ts === 'number');
                  if (typeof lastTs === 'number' && lastTs < 1_000_000_000_000) {
                    lastTs *= 1000;
                  }
                  const subline = details.detail ?? details.message ?? (typeof lastTs === 'number' ? `Last success ${formatAgo(lastTs)}` : undefined);
                  return (
                    <div key={name} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div>{name}</div>
                        {subline ? <div style={{ fontSize: 12, color: '#9aa5c4' }}>{subline}</div> : null}
                      </div>
                      <span className="badge" style={{ background: ok ? '#1d4ed8' : '#b45309' }}>{ok ? 'OK' : 'WARN'}</span>
                    </div>
                  );
                })}
                {providerCacheSummary ? (
                  <div className="list-item" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>Cache Totals</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className="chip">Hits {formatNumber(providerCacheSummary.hits ?? 0, 0)}</span>
                        <span className="chip">Misses {formatNumber(providerCacheSummary.misses ?? 0, 0)}</span>
                      </div>
                    </div>
                    {providerCacheSummary.byProvider ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {Object.entries(providerCacheSummary.byProvider).map(([provName, stats]) => (
                          <span key={provName} className="chip">
                            {provName}: {formatNumber(stats.hits ?? 0, 0)} / {formatNumber(stats.misses ?? 0, 0)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            );
          })()}
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Survival</h2>
        <div className="metric-grid">
          <div className="metric-tile"><span>Avg Hazard</span><div className="metric-value">{formatNumber(surv?.avgHazard, 2)}</div></div>
          <div className="metric-tile"><span>Flattens</span><div className="metric-value">-</div></div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Leader Wallet Hits (recent)</h2>
        <small>Latest pools triggered by leader wallets</small>
        {leaderHits.length === 0 ? (
          <div className="empty-state">No leader wallet hits observed.</div>
        ) : (
          <div className="list">
            {leaderHits.map((hit) => (
              <div key={hit.pool} className="list-item">
                <div>
                  <strong>{hit.pool}</strong>
                  <div style={{ fontSize: 12, color: '#9aa5c4' }}>Last seen {new Date(hit.lastSeenTs).toLocaleTimeString()}</div>
                </div>
                <div className="chip">Hits {hit.hits}</div>
              </div>
            ))}
          </div>
        )}
        {leaderTopWallets.length ? (
          <div style={{ marginTop: 12 }}>
            <small>Top wallets</small>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {leaderTopWallets.map((row) => (
                <span key={row.wallet} className="chip">
                  {row.wallet.slice(0, 4)}…{row.wallet.slice(-4)} · {formatNumber(row.score ?? 0, 3)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Sizing Distribution</h2>
        {(!sizingTop || sizingTop.length === 0) ? (
          <div className="empty-state">No decisions yet.</div>
        ) : (
          <div className="list">
            {sizingTop.map((r) => (
              <div key={r.arm} className="list-item">
                <div>{r.arm}</div>
                <div>{formatNumber(r.share * 100, 1)}%</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 8 / span 8' }}>
        <h2>Backtest (last run {bt?.lastRunId ?? '-'})</h2>
        <div className="metric-grid">
          <div className="metric-tile"><span>Net PnL</span><div className="metric-value">{formatNumber(bt?.lastOverallNetPnl, 0)} USD</div></div>
          <div className="metric-tile"><span>Landed Rate</span><div className="metric-value">{bt ? formatNumber(bt.landedRate*100,1) : '-'}%</div></div>
          <div className="metric-tile"><span>Avg Slip</span><div className="metric-value">{formatNumber(bt?.avgSlipBps,1)} bps</div></div>
          <div className="metric-tile"><span>TTL p50/p95</span><div className="metric-value">{formatNumber(bt?.p50Ttl,0)}/{formatNumber(bt?.p95Ttl,0)} ms</div></div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Shadow Policies</h2>
        <div className="metric-grid">
          <div className="metric-tile"><span>Fee Disagree</span><div className="metric-value">{sh ? formatNumber(sh.feeDisagreePct*100,1) : '-'}%</div></div>
          <div className="metric-tile"><span>Sizing Disagree</span><div className="metric-value">{sh ? formatNumber(sh.sizingDisagreePct*100,1) : '-'}%</div></div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 12 / span 12' }}>
        <h2>Service Health</h2>
        {!health ? (
          <div className="empty-state">Loading health...</div>
        ) : (
          <div className="list">
            {Object.entries(health).map(([port, v]) => (
              <div key={port} className="list-item">
                <div><strong>:{port}</strong></div>
                <div style={{ fontSize: 12 }}>{typeof v.status === 'number' ? v.status : v.status}</div>
                <div style={{ fontSize: 12, color: '#9aa5c4' }}>{v.error ?? JSON.stringify(v.body)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 12 / span 12' }}>
        <h2>Metrics</h2>
        {!metrics ? (
          <div className="empty-state">Loading metrics...</div>
        ) : (
          <div className="list">
            <div className="list-item">
              <div><strong>Exposure</strong></div>
              <div>{formatNumber(metrics.exposureSol, 2)} SOL</div>
            </div>
            <div className="list-item">
              <div><strong>Positions Opened</strong></div>
              <div>{formatNumber(metrics.opened ?? 0, 0)}</div>
            </div>
            <div className="list-item">
              <div><strong>Trailing Activations</strong></div>
              <div>{formatNumber(metrics.trailing ?? 0, 0)}</div>
            </div>
            <div className="list-item">
              <div><strong>API RPM</strong></div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="chip">DexScreener ~ {formatNumber(metrics.apiRpm?.dexscreener ?? 0, 1)}</span>
                  <div style={{ display: 'flex', gap: 2, height: 20, alignItems: 'flex-end' }}>
                    {dexHist.map((v, i) => (
                      <span key={i} style={{ width: 3, height: Math.max(2, Math.min(20, v)), background: '#3b82f6', display: 'inline-block' }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="chip">Birdeye ~ {formatNumber(metrics.apiRpm?.birdeye ?? 0, 1)}</span>
                  <div style={{ display: 'flex', gap: 2, height: 20, alignItems: 'flex-end' }}>
                    {beHist.map((v, i) => (
                      <span key={i} style={{ width: 3, height: Math.max(2, Math.min(20, v)), background: '#10b981', display: 'inline-block' }} />
                    ))}
                  </div>
                </div>
                {metrics.apiRpm?.social ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="chip">Social ~ {formatNumber(Object.values(metrics.apiRpm.social).reduce((a, b) => a + b, 0), 1)}</span>
                    <div style={{ display: 'flex', gap: 2, height: 20, alignItems: 'flex-end' }}>
                      {socHist.map((v, i) => (
                        <span key={i} style={{ width: 3, height: Math.max(2, Math.min(20, v)), background: '#f59e0b', display: 'inline-block' }} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {metrics.apiRpm?.social && (
              <div className="list-item">
                <div>Social Sources</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(metrics.apiRpm.social).map(([src, rpm]) => (
                    <span key={src} className="chip">{src}: {formatNumber(rpm, 1)}</span>
                  ))}
                </div>
              </div>
            )}
            {metrics.apiRpm?.dexscreenerTypes && (
              <div className="list-item">
                <div>DexScreener Misses by Type</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(metrics.apiRpm.dexscreenerTypes).map(([typ, rpm]) => (
                    <span key={typ} className="chip">{typ}: {formatNumber(rpm, 1)}</span>
                  ))}
                </div>
              </div>
            )}
            {metrics.apiRpm?.birdeyeTypes && (
              <div className="list-item">
                <div>Birdeye Misses by Type</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(metrics.apiRpm.birdeyeTypes).map(([typ, rpm]) => (
                    <span key={typ} className="chip">{typ}: {formatNumber(rpm, 1)}</span>
                  ))}
                </div>
              </div>
            )}
            {metrics.exits && (
              <div className="list-item">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(metrics.exits).map(([k, v]) => (
                    <span key={k} className="chip">{k}: {formatNumber(v, 0)}</span>
                  ))}
                </div>
                <div />
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 12 / span 12' }}>
        <h2>Slot-Landing Histogram</h2>
        <small>Requires Jito configuration; displaying placeholder when unavailable</small>
        <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} style={{ width: 10, height: (i % 5 === 0 ? 20 : 10), background: '#1f2a4d' }} />
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#9aa5c4', marginTop: 8 }}>
          Awaiting Jito tips/landing telemetry; configure JITO_BLOCK_ENGINE_HTTP/GRPC to enable.
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Net PnL (24h)</h2>
        <div className="metric-grid">
          <div className="metric-tile"><span>Net</span><div className="metric-value">{formatNumber((snapshot as any)?.pnlSummary?.netUsd, 2)} USD</div></div>
          <div className="metric-tile"><span>Gross</span><div className="metric-value">{formatNumber((snapshot as any)?.pnlSummary?.grossUsd, 2)} USD</div></div>
          <div className="metric-tile"><span>Fees</span><div className="metric-value">{formatNumber((snapshot as any)?.pnlSummary?.feeUsd, 2)} USD</div></div>
          <div className="metric-tile"><span>Slippage</span><div className="metric-value">{formatNumber((snapshot as any)?.pnlSummary?.slipUsd, 2)} USD</div></div>
        </div>
      </section>

      <section className="card" style={{ gridColumn: 'span 8 / span 8' }}>
        <h2>Event Timeline</h2>
        <small>Live agent events (max {MAX_EVENTS})</small>
        {events.length === 0 ? (
          <div className="empty-state">No events captured yet.</div>
        ) : (
          <div className="timeline">
            {events.map((evt, idx) => (
              <div key={idx} className="timeline-item">
                <div style={{ fontSize: 12, color: '#9aa5c4' }}>{new Date(evt.at).toLocaleTimeString()}</div>
                <strong>{evt.type}</strong>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#c0cad9' }}>
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ gridColumn: 'span 4 / span 4' }}>
        <h2>Sizing</h2>
        <div className="metric-grid">
          <div className="metric-tile">
            <span>Equity</span>
            <div className="metric-value">{formatNumber(snapshot?.sizing?.equity, 2)} SOL</div>
          </div>
          <div className="metric-tile">
            <span>Free</span>
            <div className="metric-value">{formatNumber(snapshot?.sizing?.free, 2)} SOL</div>
          </div>
          <div className="metric-tile">
            <span>Tier</span>
            <div className="metric-value">{snapshot?.sizing?.tier ?? '-'}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

