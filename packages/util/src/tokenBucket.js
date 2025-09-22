"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBucket = void 0;
class TokenBucket {
    refillRatePerSec;
    capacity;
    tokens;
    lastRefill;
    constructor(refillRatePerSec, capacity) {
        this.refillRatePerSec = refillRatePerSec;
        this.capacity = capacity ?? refillRatePerSec;
        this.tokens = this.capacity;
        this.lastRefill = Date.now();
    }
    refill() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        if (elapsed <= 0)
            return;
        const refillAmount = elapsed * this.refillRatePerSec;
        this.tokens = Math.min(this.capacity, this.tokens + refillAmount);
        this.lastRefill = now;
    }
    tryRemove(cost = 1) {
        this.refill();
        if (this.tokens >= cost) {
            this.tokens -= cost;
            return true;
        }
        return false;
    }
    waitForToken(cost = 1) {
        this.refill();
        if (this.tokens >= cost) {
            return 0;
        }
        const deficit = cost - this.tokens;
        const waitSec = deficit / this.refillRatePerSec;
        return Math.max(waitSec * 1000, 0);
    }
}
exports.TokenBucket = TokenBucket;
//# sourceMappingURL=tokenBucket.js.map