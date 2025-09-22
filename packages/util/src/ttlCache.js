"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtlCache = void 0;
class TtlCache {
    ttlMs;
    store = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    set(key, value) {
        const expiresAt = Date.now() + this.ttlMs;
        this.store.set(key, { value, expiresAt });
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            return undefined;
        }
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
    entries() {
        const results = [];
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt < now) {
                this.store.delete(key);
                continue;
            }
            results.push([key, entry.value]);
        }
        return results;
    }
}
exports.TtlCache = TtlCache;
//# sourceMappingURL=ttlCache.js.map