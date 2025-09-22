export declare class TokenBucket {
    private readonly refillRatePerSec;
    private capacity;
    private tokens;
    private lastRefill;
    constructor(refillRatePerSec: number, capacity?: number);
    private refill;
    tryRemove(cost?: number): boolean;
    waitForToken(cost?: number): number;
}
//# sourceMappingURL=tokenBucket.d.ts.map