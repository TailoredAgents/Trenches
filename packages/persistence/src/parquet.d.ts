export declare function appendCandidateParquet(record: {
    mint: string;
    name?: string;
    symbol?: string;
    source: string;
    lpSol: number;
    ageSec: number;
    buys60: number;
    sells60: number;
    uniques60: number;
    spreadBps: number;
    safetyOk: boolean;
    ocrs: number;
    topicId?: string;
    matchScore?: number;
    poolAddress?: string;
    lpMint?: string;
    poolCoinAccount?: string;
    poolPcAccount?: string;
    createdAt: string;
}): Promise<void>;
export declare function appendTradeParquet(record: {
    mint: string;
    signature: string;
    price: number;
    quantity: number;
    route: string;
    tipLamports: number;
    slot: number;
    pnl?: number;
    createdAt: string;
}): Promise<void>;
export declare function appendPolicyActionParquet(record: {
    mint: string;
    bundleId: string;
    gate: string;
    sizeSol: number;
    slippageBps: number;
    jitoTipLamports: number;
    congestion: string;
    reward?: number;
    createdAt: string;
}): Promise<void>;
export declare function appendTopicParquet(record: {
    topicId: string;
    label: string;
    sss: number;
    decayedSss: number;
    novelty: number;
    windowSec: number;
    sources: string[];
    phrases: string[];
    addedPhrases: string[];
    centroid: number[];
    createdAt: string;
}): Promise<void>;
export declare function appendTopicWindowParquet(record: {
    windowId: string;
    topicId: string;
    openedAt: string;
    expiresAt: string;
    lastRefresh: string;
    sss: number;
    novelty: number;
}): Promise<void>;
export declare function appendTopicMatchParquet(record: {
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
}): Promise<void>;
export declare function shutdownParquetWriters(): Promise<void>;
//# sourceMappingURL=parquet.d.ts.map