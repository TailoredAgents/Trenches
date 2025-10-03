#!/usr/bin/env tsx
import 'dotenv/config';
import EventSource from 'eventsource';
import { createInMemoryLastEventIdStore, subscribeJsonStream } from '@trenches/util';

type FeedKey = 'candidates' | 'plans' | 'trades';

const FEEDS: Record<FeedKey, string> = {
  candidates: 'http://127.0.0.1:4013/events/candidates',
  plans: 'http://127.0.0.1:4015/events/plans',
  trades: 'http://127.0.0.1:4011/events/trades'
};

(globalThis as any).EventSource = EventSource as any;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return JSON.stringify(err);
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return String(err);
}

async function main(): Promise<void> {
  const counts: Record<FeedKey, number> = { candidates: 0, plans: 0, trades: 0 };
  const warns = new Set<string>();
  const disposers: Array<() => void> = [];

  for (const [key, url] of Object.entries(FEEDS) as Array<[FeedKey, string]>) {
    const subscription = subscribeJsonStream(url, {
      lastEventIdStore: createInMemoryLastEventIdStore(),
      onMessage: () => {
        counts[key] += 1;
      },
      onError: (err, attempt) => {
        warns.add(`${key}-feed attempt=${attempt} err=${formatError(err)}`);
      }
    });
    disposers.push(() => subscription.dispose());
  }

  await delay(9_000);

  for (const dispose of disposers) {
    try {
      dispose();
    } catch {
      // ignore disposal errors
    }
  }

  const parts = [
    `sse-smoke: candidates=${counts.candidates}`,
    `plans=${counts.plans}`,
    `trades=${counts.trades}`
  ];
  if (warns.size > 0) {
    parts.push(`WARN=${Array.from(warns).join('|')}`);
  }
  parts.push('(no-RPC)');
  console.log(parts.join(' '));
}

void main();
