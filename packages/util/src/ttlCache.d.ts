export declare class TtlCache<K, V> {
    private readonly ttlMs;
    private readonly store;
    constructor(ttlMs: number);
    set(key: K, value: V): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): void;
    clear(): void;
    entries(): Array<[K, V]>;
}
//# sourceMappingURL=ttlCache.d.ts.map