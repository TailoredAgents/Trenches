"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configSchema = exports.socialConfigSchema = exports.banditBundleSchema = exports.equityTierSchema = exports.concurrencyScalerSchema = void 0;
const zod_1 = require("zod");
exports.concurrencyScalerSchema = zod_1.z.object({
    base: zod_1.z.number().min(0),
    max: zod_1.z.number().min(0),
    recoveryMinutes: zod_1.z.number().min(1)
});
exports.equityTierSchema = zod_1.z.object({
    minEquity: zod_1.z.number().nonnegative(),
    maxEquity: zod_1.z.number().nullable(),
    riskFraction: zod_1.z.number().min(0).max(1)
});
exports.banditBundleSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    gate: zod_1.z.enum(['strict', 'normal', 'loose']),
    slippageBps: zod_1.z.number().int().positive(),
    tipPercentile: zod_1.z.enum(['p25', 'p50', 'p75', 'p90']),
    sizeMultiplier: zod_1.z.number().min(0.1),
    notes: zod_1.z.string().optional()
});
exports.socialConfigSchema = zod_1.z.object({
    neynar: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        watchFids: zod_1.z.array(zod_1.z.number()).default([]),
        keywords: zod_1.z.array(zod_1.z.string()).default([]),
        pollIntervalSec: zod_1.z.number().int().positive().default(15)
    }),
    bluesky: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        cursorPath: zod_1.z.string().default('./data/bluesky.cursor'),
        reconnectBackoffSec: zod_1.z.number().int().positive().default(5)
    }),
    reddit: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        subreddits: zod_1.z.array(zod_1.z.string()).default(['solanamemes', 'memecoins', 'solana']),
        pollIntervalSec: zod_1.z.number().int().positive().default(45)
    }),
    telegram: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        channels: zod_1.z.array(zod_1.z.string()).default([]),
        downloadDir: zod_1.z.string().default('./data/tdlib'),
        pollIntervalSec: zod_1.z.number().int().positive().default(10)
    }),
    gdelt: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        pollIntervalSec: zod_1.z.number().int().positive().default(900)
    })
});
exports.configSchema = zod_1.z.object({
    mode: zod_1.z.enum(['SIM', 'SHADOW', 'SEMI', 'FULL']).default('SIM'),
    logging: zod_1.z.object({
        level: zod_1.z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
        json: zod_1.z.boolean().default(true)
    }).default({ level: 'info', json: true }),
    services: zod_1.z.object({
        agentCore: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4010 }),
        executor: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4011 }),
        uiGateway: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 3000 }),
        socialIngestor: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4012 }),
        onchainDiscovery: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4013 }),
        safetyEngine: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4014 }),
        policyEngine: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4015 }),
        positionManager: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4016 }),
        narrativeMiner: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4017 }),
        metrics: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 8090 })
    }),
    gating: zod_1.z.object({
        sssMin: zod_1.z.number().min(0).max(1).default(0.6),
        ocrsMin: zod_1.z.number().min(0).max(1).default(0.68),
        lpMinSol: zod_1.z.number().min(0).default(20),
        buysSellRatioMin: zod_1.z.number().min(0).default(2.2),
        uniquesMin: zod_1.z.number().min(0).default(12),
        minPoolAgeSec: zod_1.z.number().min(0).default(30),
        maxSpreadBps: zod_1.z.number().min(0).default(150)
    }),
    watchWindows: zod_1.z.object({
        durationSec: zod_1.z.number().min(60).default(1200),
        refreshIntervalSec: zod_1.z.number().min(1).default(5),
        decayHalfLifeSec: zod_1.z.number().min(1).default(120)
    }),
    topics: zod_1.z.object({
        cluster: zod_1.z.object({
            lshBands: zod_1.z.number().int().positive().default(12),
            lshRows: zod_1.z.number().int().positive().default(6),
            minCosine: zod_1.z.number().min(0).max(1).default(0.82),
            mergeMinObservations: zod_1.z.number().int().positive().default(3)
        }),
        scoring: zod_1.z.object({
            openThreshold: zod_1.z.number().min(0).max(1).default(0.6),
            sustainThreshold: zod_1.z.number().min(0).max(1).default(0.45),
            recencyHalfLifeSec: zod_1.z.number().int().positive().default(120),
            noveltyEpsilon: zod_1.z.number().positive().default(1e-6)
        }),
        phrase: zod_1.z.object({
            minLength: zod_1.z.number().int().positive().default(3),
            maxLength: zod_1.z.number().int().positive().default(48),
            stopwords: zod_1.z.array(zod_1.z.string()).default([
                'the',
                'and',
                'for',
                'with',
                'that',
                'this',
                'have',
                'from',
                'your',
                'about',
                'into',
                'just',
                'over',
                'they',
                'what',
                'when',
                'where',
                'will',
                'make',
                'going',
                'been',
                'take',
                'like',
                'want'
            ])
        }),
        matching: zod_1.z.object({
            minTrieScore: zod_1.z.number().min(0).max(1).default(0.5),
            minCosine: zod_1.z.number().min(0).max(1).default(0.75),
            boostSymbolMatch: zod_1.z.number().min(0).max(1).default(0.15),
            coolDownSec: zod_1.z.number().int().positive().default(60)
        }),
        baseline: zod_1.z.object({
            halfLifeSec: zod_1.z.number().int().positive().default(604800),
            flushIntervalSec: zod_1.z.number().int().positive().default(300)
        }),
        test: zod_1.z
            .object({
            enabled: zod_1.z.boolean().default(false),
            seed: zod_1.z.number().int().nonnegative().optional(),
            vectorizerModule: zod_1.z.string().optional()
        })
            .default({ enabled: false })
    }),
    ladders: zod_1.z.object({
        takeProfits: zod_1.z.array(zod_1.z.number().positive()).default([1.5, 2, 3, 5]),
        multiplierPercents: zod_1.z.array(zod_1.z.number().positive()).default([50, 100, 200, 400]),
        trailActivatePct: zod_1.z.number().min(0).default(60),
        trailPct: zod_1.z.number().min(0).default(28),
        hardStopLossPct: zod_1.z.number().min(0).default(22)
    }),
    bandit: zod_1.z.object({
        rewardHorizonMinutes: zod_1.z.number().int().positive().default(30),
        updateIntervalSec: zod_1.z.number().int().positive().default(20),
        epsilonFloor: zod_1.z.number().min(0).max(1).default(0.02),
        bundles: zod_1.z.array(exports.banditBundleSchema).min(4)
    }),
    wallet: zod_1.z.object({
        reservesSol: zod_1.z.number().min(0).default(0.02),
        dailySpendCapSol: zod_1.z.number().min(0).default(1.5),
        autoSkimProfitSol: zod_1.z.number().min(0).default(0.5),
        perNameCapFraction: zod_1.z.number().min(0).max(1).default(0.3),
        perNameCapMaxSol: zod_1.z.number().positive().default(5),
        lpImpactCapFraction: zod_1.z.number().min(0).max(1).default(0.015),
        flowCapFraction: zod_1.z.number().min(0).max(1).default(0.4),
        equityTiers: zod_1.z.array(exports.equityTierSchema),
        concurrencyCap: zod_1.z.number().int().positive().default(3),
        concurrencyScaler: exports.concurrencyScalerSchema.default({ base: 1, max: 1.4, recoveryMinutes: 60 })
    }),
    rpc: zod_1.z.object({
        primaryUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        secondaryUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        wsUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jitoHttpUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jitoGrpcUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jupiterBaseUrl: zod_1.z.string().url().default('https://quote-api.jup.ag/v6')
    }),
    dataProviders: zod_1.z.object({
        neynarBaseUrl: zod_1.z.string().url().default('https://api.neynar.com'),
        dexscreenerBaseUrl: zod_1.z.string().url().default('https://api.dexscreener.com'),
        birdeyeBaseUrl: zod_1.z.string().url().default('https://public-api.birdeye.so'),
        bitqueryWsUrl: zod_1.z.string().url().default('wss://stream.bitquery.io/graphql'),
        blueskyJetstreamUrl: zod_1.z.string().url().default('wss://jetstream2.us-east.host.bsky.network'),
        gdeltPulseUrl: zod_1.z.string().url().default('https://api.gdeltproject.org/api/v2/summary/summary')
    }),
    safety: zod_1.z.object({
        lpBurnThreshold: zod_1.z.number().min(0).max(1).default(0.9),
        holderTopCap: zod_1.z.number().min(0).max(1).default(0.2),
        lockerPrograms: zod_1.z.array(zod_1.z.string()).default([
            '6z7H14RTa7tD1ynjUTduV1JN9WewtGku5Kz4DKftd84f',
            'Lock111111111111111111111111111111111111111',
            '87AxbZcq7aj3HyCuXapnwXCfJLLq5yRvCNr4ieVsg7fR'
        ]),
        ignoreAccounts: zod_1.z.array(zod_1.z.string()).default([
            '1nc1nerator11111111111111111111111111111111'
        ]),
        candidateFeedUrl: zod_1.z.string().optional()
    }),
    policy: zod_1.z.object({
        safeFeedUrl: zod_1.z.string().optional(),
        blockedFeedUrl: zod_1.z.string().optional(),
        contextWindowSec: zod_1.z.number().int().positive().default(900),
        minOcrs: zod_1.z.number().min(0).max(1).default(0.68),
        minConfidence: zod_1.z.number().min(0).max(1).default(0.4),
        dailyLossCapPct: zod_1.z.number().min(0).max(1).default(0.1),
        rewardSmoothing: zod_1.z.number().min(0).max(1).default(0.2)
    }),
    caching: zod_1.z.object({
        dexscreenerPairsTtlSec: zod_1.z.number().int().positive().default(10),
        dexscreenerTrendingTtlSec: zod_1.z.number().int().positive().default(60),
        birdeyeMultiPriceTtlSec: zod_1.z.number().int().positive().default(5),
        birdeyeTrendingTtlSec: zod_1.z.number().int().positive().default(60),
        topicEmbeddingTtlSec: zod_1.z.number().int().positive().default(600)
    }),
    alerts: zod_1.z.object({
        telegramChatId: zod_1.z.string().optional(),
        pagerdutyRoutingKey: zod_1.z.string().optional()
    }).default({}),
    persistence: zod_1.z.object({
        sqlitePath: zod_1.z.string().default('./data/trenches.db'),
        parquetDir: zod_1.z.string().default('./data/parquet'),
        parquetRollHours: zod_1.z.number().positive().default(6)
    }),
    security: zod_1.z.object({
        killSwitchToken: zod_1.z.string().optional(),
        allowRemoteKillSwitch: zod_1.z.boolean().default(false)
    }).default({ allowRemoteKillSwitch: false }),
    social: exports.socialConfigSchema
});
//# sourceMappingURL=schema.js.map