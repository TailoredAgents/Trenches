"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendCandidateParquet = appendCandidateParquet;
exports.appendTradeParquet = appendTradeParquet;
exports.appendPolicyActionParquet = appendPolicyActionParquet;
exports.appendTopicParquet = appendTopicParquet;
exports.appendTopicWindowParquet = appendTopicWindowParquet;
exports.appendTopicMatchParquet = appendTopicMatchParquet;
exports.shutdownParquetWriters = shutdownParquetWriters;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const parquetjs_lite_1 = require("parquetjs-lite");
const config_1 = require("@trenches/config");
const logger_1 = require("@trenches/logger");
const logger = (0, logger_1.createLogger)('parquet');
const candidateSchema = new parquetjs_lite_1.ParquetSchema({
    mint: { type: 'UTF8' },
    name: { type: 'UTF8', optional: true },
    symbol: { type: 'UTF8', optional: true },
    source: { type: 'UTF8' },
    lpSol: { type: 'DOUBLE' },
    ageSec: { type: 'INT64' },
    buys60: { type: 'INT64' },
    sells60: { type: 'INT64' },
    uniques60: { type: 'INT64' },
    spreadBps: { type: 'DOUBLE' },
    safetyOk: { type: 'BOOLEAN' },
    : { type: 'DOUBLE' },
    topicId: { type: 'UTF8', optional: true },
    matchScore: { type: 'DOUBLE', optional: true },
    poolAddress: { type: 'UTF8', optional: true },
    lpMint: { type: 'UTF8', optional: true },
    poolCoinAccount: { type: 'UTF8', optional: true },
    poolPcAccount: { type: 'UTF8', optional: true },
    createdAt: { type: 'UTF8' }
});
const tradeSchema = new parquetjs_lite_1.ParquetSchema({
    mint: { type: 'UTF8' },
    signature: { type: 'UTF8' },
    price: { type: 'DOUBLE' },
    quantity: { type: 'DOUBLE' },
    route: { type: 'UTF8' },
    tipLamports: { type: 'INT64' },
    slot: { type: 'INT64' },
    pnl: { type: 'DOUBLE', optional: true },
    createdAt: { type: 'UTF8' }
});
const policyActionSchema = new parquetjs_lite_1.ParquetSchema({
    mint: { type: 'UTF8' },
    bundleId: { type: 'UTF8' },
    gate: { type: 'UTF8' },
    sizeSol: { type: 'DOUBLE' },
    slippageBps: { type: 'INT64' },
    jitoTipLamports: { type: 'INT64' },
    congestion: { type: 'UTF8' },
    reward: { type: 'DOUBLE', optional: true },
    createdAt: { type: 'UTF8' }
});
const topicSchema = new parquetjs_lite_1.ParquetSchema({
    topicId: { type: 'UTF8' },
    label: { type: 'UTF8' },
    sss: { type: 'DOUBLE' },
    decayedSss: { type: 'DOUBLE' },
    novelty: { type: 'DOUBLE' },
    windowSec: { type: 'INT64' },
    sources: { type: 'UTF8' },
    phrases: { type: 'UTF8' },
    addedPhrases: { type: 'UTF8' },
    centroid: { type: 'UTF8' },
    createdAt: { type: 'UTF8' }
});
const topicWindowSchema = new parquetjs_lite_1.ParquetSchema({
    windowId: { type: 'UTF8' },
    topicId: { type: 'UTF8' },
    openedAt: { type: 'UTF8' },
    expiresAt: { type: 'UTF8' },
    lastRefresh: { type: 'UTF8' },
    sss: { type: 'DOUBLE' },
    novelty: { type: 'DOUBLE' }
});
const topicMatchSchema = new parquetjs_lite_1.ParquetSchema({
    topicId: { type: 'UTF8' },
    mint: { type: 'UTF8' },
    matchScore: { type: 'DOUBLE' },
    matchedAt: { type: 'UTF8' },
    source: { type: 'UTF8' }
});
const schemaConfigs = {
    candidates: { prefix: 'candidates', schema: candidateSchema },
    trades: { prefix: 'trades', schema: tradeSchema },
    policy_actions: { prefix: 'policy_actions', schema: policyActionSchema },
    topics: { prefix: 'topics', schema: topicSchema },
    topic_windows: { prefix: 'topic_windows', schema: topicWindowSchema },
    topic_matches: { prefix: 'topic_matches', schema: topicMatchSchema }
};
class RotatingParquetWriter {
    writer = null;
    prefix;
    schema;
    rollMs;
    currentWindowStart = null;
    pending = Promise.resolve();
    constructor(config, rollHours) {
        this.prefix = config.prefix;
        this.schema = config.schema;
        this.rollMs = rollHours * 60 * 60 * 1000;
    }
    async append(record) {
        this.pending = this.pending.then(async () => {
            await this.ensureWriter();
            if (!this.writer) {
                logger.warn({ prefix: this.prefix }, 'parquet writer missing despite ensureWriter');
                return;
            }
            await this.writer.appendRow(record);
        });
        return this.pending;
    }
    async ensureWriter() {
        const now = Date.now();
        const windowStart = this.currentWindowStart ?? this.computeWindowStart(now);
        if (!this.writer || now - windowStart >= this.rollMs) {
            await this.rotate(now);
        }
    }
    computeWindowStart(timestamp) {
        const bucket = Math.floor(timestamp / this.rollMs);
        return bucket * this.rollMs;
    }
    async rotate(now) {
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
        const cfg = (0, config_1.getConfig)();
        const baseDir = cfg.persistence.parquetDir;
        if (!fs_1.default.existsSync(baseDir)) {
            fs_1.default.mkdirSync(baseDir, { recursive: true });
        }
        const windowStart = this.computeWindowStart(now);
        const timestamp = new Date(windowStart).toISOString().replace(/[:]/g, '-');
        const filePath = path_1.default.join(baseDir, `${this.prefix}_${timestamp}.parquet`);
        this.writer = await parquetjs_lite_1.ParquetWriter.openFile(this.schema, filePath);
        this.currentWindowStart = windowStart;
        logger.info({ filePath }, 'rotated parquet writer');
    }
    async shutdown() {
        await this.pending;
        if (this.writer) {
            await this.writer.close();
            this.writer = null;
        }
    }
}
const writers = {};
function getWriter(name) {
    const cfg = (0, config_1.getConfig)();
    if (!writers[name]) {
        writers[name] = new RotatingParquetWriter(schemaConfigs[name], cfg.persistence.parquetRollHours);
    }
    return writers[name];
}
async function appendCandidateParquet(record) {
    await getWriter('candidates').append(record);
}
async function appendTradeParquet(record) {
    await getWriter('trades').append(record);
}
async function appendPolicyActionParquet(record) {
    await getWriter('policy_actions').append(record);
}
async function appendTopicParquet(record) {
    await getWriter('topics').append({
        topicId: record.topicId,
        label: record.label,
        sss: record.sss,
        decayedSss: record.decayedSss,
        novelty: record.novelty,
        windowSec: record.windowSec,
        sources: JSON.stringify(record.sources),
        phrases: JSON.stringify(record.phrases),
        addedPhrases: JSON.stringify(record.addedPhrases),
        centroid: JSON.stringify(record.centroid),
        createdAt: record.createdAt
    });
}
async function appendTopicWindowParquet(record) {
    await getWriter('topic_windows').append({
        windowId: record.windowId,
        topicId: record.topicId,
        openedAt: record.openedAt,
        expiresAt: record.expiresAt,
        lastRefresh: record.lastRefresh,
        sss: record.sss,
        novelty: record.novelty
    });
}
async function appendTopicMatchParquet(record) {
    await getWriter('topic_matches').append({
        topicId: record.topicId,
        mint: record.mint,
        matchScore: record.matchScore,
        matchedAt: record.matchedAt,
        source: record.source
    });
}
async function shutdownParquetWriters() {
    await Promise.all(Object.values(writers).map((writer) => writer?.shutdown() ?? Promise.resolve()));
}
//# sourceMappingURL=parquet.js.map