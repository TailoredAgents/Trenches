export type RawPairEvent = {
    source: 'birdeye-bds';
    mint?: string;
    poolAddress?: string;
    baseMint?: string;
    quoteMint?: string;
    amm?: string;
    ts?: number;
};
type Health = {
    status: 'ok' | 'degraded';
    lastEventTs: number | null;
    message?: string;
};
export declare class BirdeyeBdsProvider {
    private readonly onEvent;
    private ws?;
    private reconnectTimer?;
    private subscribed;
    private lastEventTs;
    private healthMsg;
    private stopped;
    constructor(onEvent: (ev: RawPairEvent) => void);
    start(): void;
    stop(): void;
    getHealth(): Health;
    private connect;
    private scheduleReconnect;
    private parseEvent;
}
export {};
