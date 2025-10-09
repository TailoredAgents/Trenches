export type PendingSelectionEntry = {
  actionId: string;
  context: number[];
  expectedReward: number;
  createdAt: number;
  mint: string;
  orderId: string;
};

export class PendingSelectionQueue {
  private readonly byId = new Map<string, PendingSelectionEntry>();
  private readonly byMint = new Map<string, PendingSelectionEntry[]>();

  constructor(
    private readonly expiryMs: number,
    private readonly mintMatchJitterMs: number
  ) {}

  enqueue(entry: PendingSelectionEntry): void {
    this.byId.set(entry.orderId, entry);
    const queue = this.byMint.get(entry.mint);
    if (queue) {
      queue.push(entry);
    } else {
      this.byMint.set(entry.mint, [entry]);
    }
  }

  takeById(orderId: string | null | undefined): PendingSelectionEntry | undefined {
    if (!orderId) {
      return undefined;
    }
    const entry = this.byId.get(orderId);
    if (!entry) {
      return undefined;
    }
    this.remove(entry);
    return entry;
  }

  shiftByMint(mint: string | null | undefined, execTs: number): PendingSelectionEntry | undefined {
    if (!mint) {
      return undefined;
    }
    const queue = this.byMint.get(mint);
    if (!queue || queue.length === 0) {
      return undefined;
    }
    const jitterDeadline = execTs + this.mintMatchJitterMs;
    let index = queue.findIndex((item) => item.createdAt <= jitterDeadline);
    if (index === -1) {
      index = 0;
    }
    const [entry] = queue.splice(index, 1);
    if (queue.length === 0) {
      this.byMint.delete(mint);
    }
    this.byId.delete(entry.orderId);
    return entry;
  }

  prune(now: number, onExpired: (entry: PendingSelectionEntry) => void): void {
    for (const entry of Array.from(this.byId.values())) {
      if (entry.createdAt <= now - this.expiryMs) {
        this.remove(entry);
        onExpired(entry);
      }
    }
  }

  size(): number {
    return this.byId.size;
  }

  private remove(entry: PendingSelectionEntry): void {
    this.byId.delete(entry.orderId);
    const queue = this.byMint.get(entry.mint);
    if (!queue) {
      return;
    }
    const next = queue.filter((item) => item.orderId !== entry.orderId);
    if (next.length === 0) {
      this.byMint.delete(entry.mint);
    } else {
      this.byMint.set(entry.mint, next);
    }
  }
}
