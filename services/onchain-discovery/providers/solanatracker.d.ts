export type StItem = {
    mint?: string;
    address?: string;
    symbol?: string;
    poolAddress?: string;
    ts?: number;
    [k: string]: any;
};
export type StEvent = {
    source: 'solanatracker';
    mint: string;
    symbol?: string;
    poolAddress?: string;
    ts?: number;
};
type Health = {
    status: 'ok' | 'degraded';
    lastPollTs: number | null;
    message?: string;
};
export declare class SolanaTrackerProvider {
    private readonly onEvent;
    private timer?;
    private lastPoll;
    private cache;
    private stopped;
    private healthMsg;
    constructor(onEvent: (ev: StEvent) => void);
    start(): void;
    stop(): void;
    getHealth(): Health;
    private schedule;
    private loop;
    private fetchList;
}
export {};
