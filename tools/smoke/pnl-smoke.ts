#!/usr/bin/env tsx
import { upsertPrice, insertExecOutcome, getPnLSummary } from '@trenches/persistence';

const now = Date.now();
upsertPrice(now-1000, 'SOL', 150);
insertExecOutcome({ ts: now-500, quotePrice: 1, execPrice: 1, filled: 1, route: 'jupiter', cuPrice: 0, slippageReq: 100, slippageReal: 50, timeToLandMs: 800, errorCode: null, notes: 'smoke', priorityFeeLamports: 10000, amountIn: 1_000_000_000, amountOut: 1000, feeLamportsTotal: 15000 });
const s = getPnLSummary();
console.log('pnl-smoke', s);

