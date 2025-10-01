"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentSnapshot, AgentEvent, AgentMode } from './types';

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
    const source = new EventSource(`${baseUrl}/events/agent`);
    setStatus('connecting');

    source.onopen = () => {
      setStatus('open');
    };

    source.onerror = () => {
      setStatus('closed');
      source.close();
    };

    source.onmessage = (evt) => {
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
    };

    return () => {
      source.close();
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
  } | null>(null);
  const [policy, setPolicy] = useState<{ congestion?: string } | null>(null);
  const [exposureHist, setExposureHist] = useState<number[]>([]);
  const [dexHist, setDexHist] = useState<number[]>([]);
  const [beHist, setBeHist] = useState<number[]>([]);
  const [socHist, setSocHist] = useState<number[]>([]);
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
      } catch {}
    }
    load();
    const t = setInterval(load, 7000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        const j = (await r.json()) as Record<string, { status: number | string; body?: any; error?: string }>;
        if (!cancelled) setHealth(j);
      } catch {}
    }
    load();
    const t = setInterval(load, 7000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const migrations = snapshot?.latestMigrations ?? [];
  const lag = snapshot?.migrationLag;
  const rug = snapshot?.rugGuard;
  const exec = snapshot?.execution as any;
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
        };
        if (!cancelled) setMetrics(j);
      } catch {}
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
      } catch {}
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
      } catch {}
    }
    load();
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const candidates = snapshot?.candidates ?? [];
  const topics = snapshot?.topics ?? [];
  const positions = snapshot?.positions ?? [];

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
                  <strong>{cand.name}</strong>
                  <div style={{ color: '#9aa5c4', fontSize: 12 }}>Mint: {cand.mint}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="chip" style={{ marginBottom: 6 }}>OCRS {formatNumber(cand.ocrs, 2)}</div>
                  <div style={{ fontSize: 12 }}>{cand.buys} buys / {cand.sells} sells • uniques {cand.uniques}</div>
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
              {exposureDelta === undefined ? '—' : `${exposureDelta > 0 ? '+' : ''}${formatNumber(exposureDelta, 2)} since last`}
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
              Tip guide: p25 200–400k, p50 500k–1M, p75 1.5–2.5M, p90 3–4M
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
        <h2>Execution</h2>
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
        <h2>Survival</h2>
        <div className="metric-grid">
          <div className="metric-tile"><span>Avg Hazard</span><div className="metric-value">{formatNumber(surv?.avgHazard, 2)}</div></div>
          <div className="metric-tile"><span>Flattens</span><div className="metric-value">-</div></div>
        </div>
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
