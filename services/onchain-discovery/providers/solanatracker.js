"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaTrackerProvider = void 0;
const logger_1 = require("@trenches/logger");
const metrics_1 = require("../src/metrics");
const config_1 = require("@trenches/config");
const util_1 = require("@trenches/util");
const logger = (0, logger_1.createLogger)('onchain:solanatracker');
class SolanaTrackerProvider {
    constructor(onEvent) {
        this.onEvent = onEvent;
        this.lastPoll = null;
        this.stopped = false;
        const cfg = (0, config_1.getConfig)();
        const ttlMs = Math.max(5000, (cfg.providers?.solanatracker?.ttlSec ?? 10) * 1000);
        this.cache = new util_1.TtlCache(ttlMs);
    }
    start() {
        this.stopped = false;
        this.loop();
    }
    stop() {
        this.stopped = true;
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
    }
    getHealth() {
        let status = this.lastPoll ? 'ok' : 'degraded';
        if (!process.env.SOLANATRACKER_API_KEY) {
            status = 'degraded';
            this.healthMsg = 'awaiting_credentials';
        }
        return { status, lastPollTs: this.lastPoll, message: this.healthMsg };
    }
    schedule(nextMs) {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => this.loop(), nextMs);
    }
    async loop() {
        if (this.stopped)
            return;
        const cfg = (0, config_1.getConfig)();
        const { enabled, baseUrl, pollSec, endpoints } = cfg.providers?.solanatracker ?? {};
        if (!enabled) {
            this.schedule(5000);
            return;
        }
        const key = process.env.SOLANATRACKER_API_KEY;
        const headers = { 'Content-Type': 'application/json' };
        if (key) {
            headers['Authorization'] = `Bearer ${key}`;
            headers['x-api-key'] = key; // support either schema
        }
        else {
            this.healthMsg = 'awaiting_credentials';
        }
        try {
            if (endpoints?.trending) {
                await this.fetchList(`${baseUrl}/tokens/trending?timeframe=1h`, headers);
            }
            if (endpoints?.latest) {
                await this.fetchList(`${baseUrl}/tokens/latest`, headers);
            }
            if (endpoints?.launchpads?.pumpfun) {
                await this.fetchList(`${baseUrl}/launchpad/pumpfun?state=graduating,graduated`, headers);
            }
            if (endpoints?.launchpads?.jupstudio) {
                await this.fetchList(`${baseUrl}/launchpad/jup-studio?state=graduating,graduated`, headers);
            }
            const now = Date.now();
            this.lastPoll = now;
            metrics_1.stLastPollTs.set(Math.floor(now / 1000));
        }
        catch (err) {
            metrics_1.stErrorsTotal.inc();
            const msg = (err && err.message) || String(err);
            if (/401|403/.test(msg)) {
                this.healthMsg = 'unauthorized';
            }
            logger.error({ err }, 'solanatracker polling error');
        }
        finally {
            const delay = Math.max(1000, (pollSec ?? 8) * 1000);
            this.schedule(delay);
        }
    }
    async fetchList(url, headers) {
        try {
            const res = await fetch(url, { headers, keepalive: false });
            if (res.status === 429) {
                this.healthMsg = 'rate_limited';
                logger.warn({ url }, 'solanatracker rate limited');
                return;
            }
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status} ${text}`);
            }
            const data = await res.json();
            const items = Array.isArray(data?.tokens) ? data.tokens : Array.isArray(data) ? data : (data?.items ?? []);
            for (const it of items) {
                const mint = it.mint || it.address;
                if (!mint)
                    continue;
                if (this.cache.has(mint))
                    continue;
                this.cache.set(mint, true);
                metrics_1.stEventsTotal.inc();
                const ev = { source: 'solanatracker', mint, symbol: it.symbol, poolAddress: it.poolAddress, ts: it.ts ? Number(it.ts) : undefined };
                this.onEvent(ev);
            }
        }
        catch (err) {
            metrics_1.stErrorsTotal.inc();
            logger.error({ err, url }, 'solanatracker fetch failed');
        }
    }
}
exports.SolanaTrackerProvider = SolanaTrackerProvider;
//# sourceMappingURL=solanatracker.js.map