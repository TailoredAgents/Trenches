import { describe, expect, it } from 'vitest';
import { PendingSelectionQueue, type PendingSelectionEntry } from './pendingSelections';

const baseEntry = (overrides: Partial<PendingSelectionEntry>): PendingSelectionEntry => ({
  actionId: 'a',
  context: [1, 2, 3],
  expectedReward: 1,
  createdAt: 0,
  mint: 'mint',
  orderId: 'id',
  ...overrides
});

describe('PendingSelectionQueue', () => {
  it('returns selection by client order id', () => {
    const queue = new PendingSelectionQueue(60_000, 5_000);
    const first = baseEntry({ orderId: 'o1', createdAt: 1000 });
    const second = baseEntry({ orderId: 'o2', createdAt: 2000 });
    queue.enqueue(first);
    queue.enqueue(second);
    expect(queue.takeById('o2')).toEqual(second);
    expect(queue.shiftByMint('mint', 2_000)).toEqual(first);
  });

  it('shift by mint falls back when id is absent', () => {
    const queue = new PendingSelectionQueue(60_000, 5_000);
    const entry = baseEntry({ orderId: 'o1', createdAt: 100, mint: 'M' });
    queue.enqueue(entry);
    expect(queue.shiftByMint('M', 50)).toEqual(entry);
    expect(queue.shiftByMint('M', 50)).toBeUndefined();
  });

  it('prunes expired selections', () => {
    const queue = new PendingSelectionQueue(1_000, 5_000);
    const entry = baseEntry({ orderId: 'o1', createdAt: 0 });
    queue.enqueue(entry);
    const expired: PendingSelectionEntry[] = [];
    queue.prune(2_000, (removed) => expired.push(removed));
    expect(expired).toEqual([entry]);
    expect(queue.takeById('o1')).toBeUndefined();
  });
});
