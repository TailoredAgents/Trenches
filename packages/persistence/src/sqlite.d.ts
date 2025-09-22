import DatabaseConstructor from 'better-sqlite3';
import { SocialPost, TopicEvent, TokenCandidate, TradeEvent } from '@trenches/shared';
export declare function getDb(): DatabaseConstructor.Database;
export declare function withTransaction<T>(fn: (trx: DatabaseConstructor.Database) => T): T;
export declare function recordHeartbeat(component: string, status: string, message?: string): void;
export declare function storeTopicEvent(event: TopicEvent): void;
export type TopicClusterRecord = {
    topicId: string;
    label: string;
    centroid: number[];
    phrases: string[];
    sss: number;
    novelty: number;
    updatedAt: string;
};
export declare function upsertTopicCluster(cluster: TopicClusterRecord): void;
export declare function fetchTopicClusters(): TopicClusterRecord[];
export type TopicWindowRecord = {
    windowId: string;
    topicId: string;
    openedAt: string;
    expiresAt: string;
    lastRefresh: string;
    sss: number;
    novelty: number;
};
export declare function upsertTopicWindow(window: TopicWindowRecord): void;
export declare function removeTopicWindow(windowId: string): void;
export declare function fetchTopicWindows(): TopicWindowRecord[];
export declare function fetchActiveTopicWindows(referenceIso: string): TopicWindowRecord[];
export declare function recordTopicMatch(match: {
    id: string;
    topicId: string;
    mint: string;
    matchScore: number;
    matchedAt: string;
    source: string;
}): void;
export type PhraseBaselineRow = {
    phrase: string;
    count: number;
    engagement: number;
    authors: number;
    updatedAt: string;
};
export declare function loadPhraseBaseline(): PhraseBaselineRow[];
export declare function upsertPhraseBaseline(entry: PhraseBaselineRow): void;
export declare function storeTokenCandidate(candidate: TokenCandidate): void;
export declare function logTradeEvent(event: TradeEvent): void;
export declare function upsertPosition(payload: {
    mint: string;
    quantity: number;
    averagePrice: number;
    realizedPnl?: number;
    unrealizedPnl?: number;
    state: string;
    ladderHits: string[];
    trailActive: boolean;
}): void;
export declare function recordSizingDecision(input: {
    mint?: string;
    equity: number;
    free: number;
    tier: string;
    caps: Record<string, number>;
    finalSize: number;
    reason: string;
}): void;
export declare function closeDb(): void;
export declare function storeSocialPost(post: SocialPost): void;
export declare function getOpenPositionsCount(): number;
export declare function getDailySizingSpendSince(isoTimestamp: string): number;
export declare function getDailyRealizedPnlSince(isoTimestamp: string): number;
export declare function recordPolicyAction(input: {
    actionId: string;
    mint: string;
    context: Record<string, unknown>;
    parameters: Record<string, unknown>;
    reward?: number;
}): void;
export type BanditStateRow = {
    actionId: string;
    ainv: number[][];
    b: number[];
};
export declare function loadBanditState(): BanditStateRow[];
export declare function upsertBanditState(input: {
    actionId: string;
    ainv: number[][];
    b: number[];
}): void;
export declare function listOpenPositions(): Array<{
    mint: string;
    quantity: number;
    averagePrice: number;
    realizedPnl: number;
    unrealizedPnl: number;
    state: string;
    ladderHits: string[];
    trailActive: boolean;
}>;
export declare function getCandidateByMint(mint: string): TokenCandidate | undefined;
export declare function recordOrderPlan(order: {
    id: string;
    mint: string;
    gate: string;
    sizeSol: number;
    slippageBps: number;
    jitoTipLamports: number;
    computeUnitPrice?: number;
    route: string;
    status: string;
    side?: 'buy' | 'sell';
    tokenAmount?: number | null;
    expectedSol?: number | null;
}): void;
export declare function recordFill(fill: {
    signature: string;
    mint: string;
    price: number;
    quantity: number;
    route: string;
    tipLamports: number;
    slot: number;
}): void;
//# sourceMappingURL=sqlite.d.ts.map