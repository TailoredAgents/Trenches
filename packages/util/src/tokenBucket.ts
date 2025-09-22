export class TokenBucket {
  private capacity: number;
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly refillRatePerSec: number, capacity?: number) {
    this.capacity = capacity ?? refillRatePerSec;
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    const refillAmount = elapsed * this.refillRatePerSec;
    this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
    this.lastRefill = now;
  }

  tryRemove(cost = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  waitForToken(cost = 1): number {
    this.refill();
    if (this.tokens >= cost) {
      return 0;
    }
    const deficit = cost - this.tokens;
    const waitSec = deficit / this.refillRatePerSec;
    return Math.max(waitSec * 1000, 0);
  }
}
