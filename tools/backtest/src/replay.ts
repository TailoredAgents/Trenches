#!/usr/bin/env node
import path from 'path';
import DatabaseConstructor from 'better-sqlite3';
import fs from 'fs';
import yargs from 'yargs';
import fetch from 'node-fetch';
import http from 'http';

const argv = yargs(process.argv.slice(2))
  .option('db', { type: 'string', default: path.resolve(process.cwd(), 'data/trenches.db') })
  .option('limit', { type: 'number', default: 100 })
  .option('executor', { type: 'string', default: 'http://127.0.0.1:4011' })
  .option('post', { type: 'boolean', default: false, describe: 'POST plans to executor /execute' })
  .option('serve-plans', { type: 'boolean', default: false, describe: 'Serve SSE /events/plans for executor' })
  .option('port', { type: 'number', default: 4505, describe: 'Port for SSE /events/plans' })
  .option('speed', { type: 'number', default: 1, describe: 'Playback speed multiplier (1 = 1x)' })
  .option('mint', { type: 'string', default: '', describe: 'Filter by mint (optional)' })
  .option('since', { type: 'string', default: '', describe: 'Filter events since ISO timestamp (optional)' })
  .option('until', { type: 'string', default: '', describe: 'Filter events until ISO timestamp (optional)' })
  .option('csv', { type: 'string', default: '', describe: 'Write CSV of plans to this path (optional)' })
  .option('sample', { type: 'number', default: 0, describe: 'Sample N plans (deterministic with --seed)' })
  .option('seed', { type: 'number', default: 1337, describe: 'Seed for deterministic sampling' })
  .option('replay-by-ts', { type: 'boolean', default: true, describe: 'When serving SSE, respect original timestamps scaled by --speed' })
  .strict()
  .parseSync();

const db = new DatabaseConstructor(argv.db);

type TradeEvent = { t: string; plan?: any };

function* iterateEvents(limit: number, since?: string, until?: string): Generator<{ evt: TradeEvent; created_at: string }> {
  const clauses: string[] = [];
  const params: any[] = [];
  if (since) {
    clauses.push('created_at >= ?');
    params.push(since);
  }
  if (until) {
    clauses.push('created_at <= ?');
    params.push(until);
  }
  let sql = 'SELECT event_type, payload, created_at FROM events';
  if (clauses.length > 0) {
    sql += ' WHERE ' + clauses.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Array<{ event_type: string; payload: string; created_at: string }>;
  for (const row of rows) {
    try {
      const evt = JSON.parse(row.payload) as TradeEvent;
      yield { evt, created_at: row.created_at };
    } catch {
      /* ignore malformed payload */
    }
  }
}

async function main() {
  const plans: Array<{ plan: any; context: { candidate: { mint: string } }; at: string }> = [];
  for (const { evt, created_at } of iterateEvents(argv.limit, argv.since || undefined, argv.until || undefined)) {
    if (evt.t === 'order_plan' && evt.plan) {
      if (argv.mint && String(evt.plan.mint) !== argv.mint) continue;
      plans.push({ plan: evt.plan, context: { candidate: { mint: evt.plan.mint } }, at: created_at });
    }
  }

  // Deterministic sampling if requested
  function mulberry32(a: number) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  if (argv.sample && argv.sample > 0 && argv.sample < plans.length) {
    const rng = mulberry32(Number(argv.seed) >>> 0);
    const indices = plans.map((_, i) => i);
    // Fisher-Yates shuffle deterministically
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const picked = new Set(indices.slice(0, argv.sample));
    const sampled = plans.filter((_, idx) => picked.has(idx));
    // Keep original chronological order (as currently loaded)
    sampled.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    (plans as any).length = 0;
    (plans as any).push(...sampled);
  }

  if (argv.servePlans) {
    const server = http.createServer((req, res) => {
      if (!req.url) return res.end();
      if (req.url.startsWith('/events/plans')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });
        let cancelled = false;
        req.on('close', () => {
          cancelled = true;
        });

        const toEpochMs = (s: string): number => {
          // Normalize "YYYY-MM-DD HH:MM:SS" to ISO by inserting 'T' and appending 'Z'
          const iso = s.includes('T') ? s : s.replace(' ', 'T');
          const d = new Date(/Z$/.test(iso) ? iso : iso + 'Z');
          const t = d.getTime();
          return Number.isFinite(t) ? t : 0;
        };

        const speed = Math.max(0.1, Number(argv.speed));
        const useTs = Boolean(argv.replayByTs);

        const emitSequential = (i: number) => {
          if (cancelled) return;
          if (i >= plans.length) {
            res.write(': end\n\n');
            return;
          }
          const payload = plans[i];
          res.write(`data: ${JSON.stringify({ plan: payload.plan, context: payload.context })}\n\n`);
          if (!useTs || i === plans.length - 1) {
            // Fixed cadence fallback
            const fallbackDelay = Math.max(100, Math.floor(1000 / speed));
            setTimeout(() => emitSequential(i + 1), fallbackDelay);
            return;
          }
          const t0 = toEpochMs(plans[i].at);
          const t1 = toEpochMs(plans[i + 1].at);
          const dt = Math.max(0, t1 - t0);
          const delay = Math.max(25, Math.floor(dt / speed));
          setTimeout(() => emitSequential(i + 1), delay);
        };
        emitSequential(0);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });
    server.listen(argv.port, () => {
      console.log(`SSE /events/plans serving ${plans.length} plans at :${argv.port} speed x${argv.speed}`);
      console.log('Set POLICY_ENGINE_PORT to this port and start executor to consume plans.');
    });
    return; // keep server alive
  }

  // CSV export if requested
  if (argv.csv) {
    const header = 'created_at,mint,gate,route,side,sizeSol,slippageBps,jitoTipLamports\n';
    const rows = plans.map((p) => {
      const pl = p.plan || {};
      return [
        JSON.stringify(p.at),
        JSON.stringify(pl.mint ?? ''),
        JSON.stringify(pl.gate ?? ''),
        JSON.stringify(pl.route ?? ''),
        JSON.stringify(pl.side ?? 'buy'),
        pl.sizeSol ?? 0,
        pl.slippageBps ?? 0,
        pl.jitoTipLamports ?? 0
      ].join(',');
    });
    fs.writeFileSync(argv.csv, header + rows.join('\n'));
    console.log(`wrote CSV ${argv.csv} rows=${rows.length}`);
  }

  let posted = 0;
  let printed = 0;
  for (const payload of plans) {
    if (argv.post) {
      try {
        const res = await fetch(`${argv.executor}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: payload.plan, context: payload.context })
        });
        console.log(`POST /execute -> ${res.status}`);
        posted += 1;
      } catch (err) {
        console.error('post failed', err);
      }
    } else {
      console.log('PLAN', JSON.stringify(payload.plan));
      printed += 1;
    }
  }
  console.log(`done. plans=${plans.length} posted=${posted} printed=${printed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
