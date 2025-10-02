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
    maeBps?: number;
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
    maeBps: number;
}>;
export declare function getCandidateByMint(mint: string): TokenCandidate | undefined;
export declare function listRecentCandidates(limit?: number): Array<{
    mint: string;
    name: string;
    ocrs: number;
    lp: number;
    buys: number;
    sells: number;
    uniques: number;
    safetyOk: boolean;
}>;
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
export declare function insertMigrationEvent(e: {
    ts: number;
    mint: string;
    pool: string;
    source: string;
    initSig: string;
}): void;
export declare function listRecentMigrationEvents(limit?: number): Array<{
    ts: number;
    mint: string;
    pool: string;
    source: string;
    initSig: string;
}>;
export declare function insertRugVerdict(v: {
    ts: number;
    mint: string;
    rugProb: number;
    reasons: string[];
}): void;
export declare function insertScore(s: {
    ts: number;
    mint: string;
    horizon: string;
    score: number;
    features: Record<string, number>;
}): void;
export declare function computeMigrationCandidateLagQuantiles(): {
    p50: number;
    p95: number;
};
export declare function getRugGuardStats(): {
    passRate: number;
    avgRugProb: number;
};
export declare function insertFillPrediction(pred: {
    ts: number;
    route: string;
    pFill: number;
    expSlipBps: number;
    expTimeMs: number;
}, ctx: Record<string, unknown>): void;
export declare function insertFeeDecision(dec: {
    ts: number;
    cuPrice: number;
    cuLimit: number;
    slippageBps: number;
}, ctx: Record<string, unknown>): void;
export declare function insertExecOutcome(row: {
    ts: number;
    quotePrice: number;
    execPrice?: number | null;
    filled: number;
    route?: string | null;
    cuPrice?: number | null;
    slippageReq?: number | null;
    slippageReal?: number | null;
    timeToLandMs?: number | null;
    errorCode?: string | null;
    notes?: string | null;
    priorityFeeLamports?: number | null;
    amountIn?: number | null;
    amountOut?: number | null;
    feeLamportsTotal?: number | null;
}): void;
export declare function getExecSummary(): {
    landedRate: number;
    avgSlipBps: number;
    p50Ttl: number;
    p95Ttl: number;
};
export declare function upsertPrice(ts: number, symbol: string, usd: number): void;
export declare function getNearestPrice(ts: number, symbol: string): number | null;
export declare function getPnLSummary(): {
    netUsd: number;
    grossUsd: number;
    feeUsd: number;
    slipUsd: number;
};
export declare function insertHazardState(h: {
    ts: number;
    mint: string;
    hazard: number;
    trailBps: number;
    ladder: Array<[number, number]>;
}): void;
export declare function insertSizingDecision(dec: {
    ts: number;
    mint: string;
    arm: string;
    notional: number;
}, ctx: Record<string, unknown>): void;
export declare function insertSizingOutcome(row: {
    ts: number;
    mint: string;
    notional: number;
    pnlUsd: number;
    maeBps: number;
    closed: number;
}): void;
export declare function getRiskBudget(): {
    dailyLossCapUsd: number;
    usedUsd: number;
    remainingUsd: number;
};
export declare function getSizingDistribution(): Array<{
    arm: string;
    share: number;
}>;
export declare function createBacktestRun(params: Record<string, unknown>, notes?: string): number;
export declare function finishBacktestRun(runId: number): void;
export declare function insertBacktestResult(runId: number, metric: string, value: number, segment?: string): void;
export declare function insertShadowFeeDecision(row: {
    ts: number;
    mint: string;
    chosenArm: number;
    baselineArm?: number | null;
    deltaRewardEst?: number | null;
}, ctx: Record<string, unknown>): void;
export declare function insertShadowSizingDecision(row: {
    ts: number;
    mint: string;
    chosenArm: string;
    baselineArm?: string | null;
    deltaRewardEst?: number | null;
}, ctx: Record<string, unknown>): void;
