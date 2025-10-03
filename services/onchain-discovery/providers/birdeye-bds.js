"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BirdeyeBdsProvider = void 0;
const ws_1 = __importDefault(require("ws"));
const logger_1 = require("@trenches/logger");
const metrics_1 = require("../src/metrics");
const config_1 = require("@trenches/config");
const logger = (0, logger_1.createLogger)('onchain:birdeye-bds');
class BirdeyeBdsProvider {
    constructor(onEvent) {
        this.onEvent = onEvent;
        this.subscribed = false;
        this.lastEventTs = null;
        this.stopped = false;
    }
    start() {
        this.stopped = false;
        this.connect();
    }
    stop() {
        this.stopped = true;
        try {
            this.ws?.close();
        }
        catch (err) {
            logger.error({ err }, 'failed to close birdeye websocket');
        }
        this.ws = undefined;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
    }
    getHealth() {
        const ok = Boolean(this.lastEventTs) || this.subscribed;
        let status = ok ? 'ok' : 'degraded';
        const cfg = (0, config_1.getConfig)();
        const url = cfg.providers?.birdeyeBds?.wsUrl ?? '';
        if (!url) {
            status = 'degraded';
            this.healthMsg = 'awaiting_credentials';
        }
        return { status, lastEventTs: this.lastEventTs, message: this.healthMsg };
    }
    connect() {
        const cfg = (0, config_1.getConfig)();
        const { wsUrl, reconnect, subscribe, enabled } = cfg.providers?.birdeyeBds ?? {};
        if (!enabled) {
            logger.info('Birdeye BDS disabled');
            return;
        }
        if (!wsUrl) {
            logger.warn('BIRDEYE_BDS_WS_URL missing');
            this.scheduleReconnect(reconnect?.minMs ?? 1000, reconnect?.maxMs ?? 10000);
            return;
        }
        const headers = {};
        const key = process.env.BIRDEYE_API_KEY;
        if (key)
            headers['x-api-key'] = key;
        this.subscribed = false;
        try {
            const ws = new ws_1.default(wsUrl, { headers });
            this.ws = ws;
            ws.on('open', () => {
                try {
                    if (subscribe?.tokenNewListing) {
                        ws.send(JSON.stringify({ action: 'SUBSCRIBE_TOKEN_NEW_LISTING' }));
                    }
                    if (subscribe?.newPair) {
                        ws.send(JSON.stringify({ action: 'SUBSCRIBE_NEW_PAIR' }));
                    }
                    this.subscribed = true;
                    logger.info('birdeye bds subscribed');
                }
                catch (err) {
                    logger.error({ err }, 'failed to send subscribe frames');
                }
            });
            ws.on('message', (data) => {
                try {
                    const text = data.toString();
                    let payload;
                    try {
                        payload = JSON.parse(text);
                    }
                    catch (err) {
                        logger.error({ err }, 'failed to parse birdeye payload');
                        payload = text;
                    }
                    const ev = this.parseEvent(payload);
                    if (ev) {
                        metrics_1.bdsEventsTotal.inc();
                        const now = Date.now();
                        this.lastEventTs = now;
                        metrics_1.bdsLastEventTs.set(Math.floor(now / 1000));
                        this.onEvent(ev);
                    }
                }
                catch (err) {
                    metrics_1.bdsErrorsTotal.inc();
                    logger.error({ err }, 'bds message handling failed');
                }
            });
            ws.on('error', (err) => {
                metrics_1.bdsErrorsTotal.inc();
                logger.error({ err }, 'bds ws error');
            });
            ws.on('unexpected-response', (_req, res) => {
                if (res?.statusCode === 401 || res?.statusCode === 403) {
                    this.healthMsg = 'unauthorized';
                }
            });
            ws.on('close', () => {
                if (this.stopped)
                    return;
                this.scheduleReconnect(reconnect?.minMs ?? 1000, reconnect?.maxMs ?? 10000);
            });
        }
        catch (err) {
            metrics_1.bdsErrorsTotal.inc();
            logger.error({ err }, 'bds connect failed');
            this.scheduleReconnect(reconnect?.minMs ?? 1000, reconnect?.maxMs ?? 10000);
        }
    }
    scheduleReconnect(minMs, maxMs) {
        const delay = Math.min(maxMs, Math.max(minMs, Math.floor(minMs + Math.random() * (maxMs - minMs))));
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
    parseEvent(payload) {
        // Try to normalize common shapes; adjust as needed when real payloads are known
        // Accept fields mint, poolAddress/basePoolAddress, baseMint/quoteMint, amm, ts/timestamp
        const mint = payload?.mint || payload?.tokenAddress || payload?.baseMint;
        const poolAddress = payload?.poolAddress || payload?.pool || payload?.pairAddress;
        const baseMint = payload?.baseMint || mint;
        const quoteMint = payload?.quoteMint || payload?.quoteTokenAddress;
        const amm = payload?.amm || payload?.dexId || payload?.dex;
        const ts = typeof payload?.ts === 'number' ? payload.ts : (payload?.timestamp ? Date.parse(payload.timestamp) : Date.now());
        if (!mint && !baseMint)
            return undefined;
        return { source: 'birdeye-bds', mint: mint ?? baseMint, poolAddress, baseMint, quoteMint, amm, ts };
    }
}
exports.BirdeyeBdsProvider = BirdeyeBdsProvider;
//# sourceMappingURL=birdeye-bds.js.map