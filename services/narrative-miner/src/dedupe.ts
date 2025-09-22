export class DedupeCache {
  private readonly ttlMs: number;
  private readonly entries = new Map<string, number>();

  constructor(ttlMs: number) {
    if (ttlMs <= 0) {
      throw new Error('DedupeCache ttlMs must be positive');
    }
    this.ttlMs = ttlMs;
  }

  /**
   * Returns true when the identifier has been seen within the TTL window.
   */
  public has(id: string, now: number): boolean {
    this.prune(now);
    const last = this.entries.get(id);
    this.entries.set(id, now);
    if (last === undefined) {
      return false;
    }
    return now - last < this.ttlMs;
  }

  public size(now?: number): number {
    if (now !== undefined) {
      this.prune(now);
    }
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    const threshold = now - this.ttlMs;
    for (const [key, timestamp] of this.entries.entries()) {
      if (timestamp < threshold) {
        this.entries.delete(key);
      }
    }
  }
}
