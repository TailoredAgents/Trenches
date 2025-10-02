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
        pollIntervalSec: zod_1.z.number().int().positive().default(45),
        appType: zod_1.z.enum(['installed', 'web']).default('installed')
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
        migrationWatcher: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4018 }),
        leaderWallets: zod_1.z.object({ port: zod_1.z.number().int().min(1).max(65535) }).default({ port: 4019 }),
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
        primaryUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default('http://127.0.0.1:8899'),
        secondaryUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        wsUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jitoHttpUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jitoGrpcUrl: zod_1.z.string().url().or(zod_1.z.literal('')).default(''),
        jupiterBaseUrl: zod_1.z.string().url().default('https://quote-api.jup.ag/v6'),
        httpHeaders: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({})
    }),
    dataProviders: zod_1.z.object({
        neynarBaseUrl: zod_1.z.string().url().default('https://api.neynar.com'),
        dexscreenerBaseUrl: zod_1.z.string().url().default('https://api.dexscreener.com'),
        birdeyeBaseUrl: zod_1.z.string().url().default('https://public-api.birdeye.so'),
        blueskyJetstreamUrl: zod_1.z.string().url().default('wss://jetstream2.us-east.host.bsky.network'),
        gdeltPulseUrl: zod_1.z.string().url().default('https://api.gdeltproject.org/api/v2/summary/summary')
    }),
    providers: zod_1.z
        .object({
        solanatracker: zod_1.z
            .object({
            enabled: zod_1.z.boolean().default(true),
            baseUrl: zod_1.z.string().url().default('https://api.solanatracker.io'),
            pollSec: zod_1.z.number().int().positive().default(8),
            ttlSec: zod_1.z.number().int().positive().default(10),
            endpoints: zod_1.z
                .object({
                trending: zod_1.z.boolean().default(true),
                latest: zod_1.z.boolean().default(true),
                launchpads: zod_1.z.object({ pumpfun: zod_1.z.boolean().default(true), jupstudio: zod_1.z.boolean().default(true) }).default({ pumpfun: true, jupstudio: true })
            })
                .default({ trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } })
        })
            .default({ enabled: true, baseUrl: 'https://api.solanatracker.io', pollSec: 8, ttlSec: 10, endpoints: { trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } } })
    })
        .default({
        solanatracker: { enabled: true, baseUrl: 'https://api.solanatracker.io', pollSec: 8, ttlSec: 10, endpoints: { trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } } }
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
        candidateFeedUrl: zod_1.z.string().optional().nullable()
    }),
    policy: zod_1.z.object({
        safeFeedUrl: zod_1.z.string().optional().nullable(),
        blockedFeedUrl: zod_1.z.string().optional().nullable(),
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
    social: exports.socialConfigSchema,
    lunarcrush: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        baseUrl: zod_1.z.string().url().default('https://api.lunarcrush.com'),
        pollSec: zod_1.z.number().int().positive().default(180),
        endpoints: zod_1.z
            .object({ topics: zod_1.z.string().default('/v2'), influencers: zod_1.z.string().default('/v2') })
            .default({ topics: '/v2', influencers: '/v2' }),
        sssBias: zod_1.z
            .object({ topicBoost: zod_1.z.number().min(0).max(1).default(0.03), influencerBoost: zod_1.z.number().min(0).max(1).default(0.02), maxBoost: zod_1.z.number().min(0).max(1).default(0.06) })
            .default({ topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 })
    })
        .default({ enabled: true, baseUrl: 'https://api.lunarcrush.com', pollSec: 180, endpoints: { topics: '/v2', influencers: '/v2' }, sssBias: { topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 } }),
    priceUpdater: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        intervalMs: zod_1.z.number().int().positive().default(60000),
        staleWarnSec: zod_1.z.number().int().positive().default(300),
        pythSolUsdPriceAccount: zod_1.z.string().default('')
    })
        .default({ enabled: true, intervalMs: 60000, staleWarnSec: 300, pythSolUsdPriceAccount: '' }),
    featuresJob: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        intervalMs: zod_1.z.number().int().positive().default(86400000),
        embedder: zod_1.z.string().default('bge-small-en'),
        lookbackHours: zod_1.z.number().int().positive().default(24),
        minPostsPerAuthor: zod_1.z.number().int().positive().default(5)
    })
        .default({ enabled: true, intervalMs: 86400000, embedder: 'bge-small-en', lookbackHours: 24, minPostsPerAuthor: 5 }),
    features: zod_1.z
        .object({
        migrationWatcher: zod_1.z.boolean().default(true),
        rugGuard: zod_1.z.boolean().default(true),
        alphaRanker: zod_1.z.boolean().default(true),
        fillNet: zod_1.z.boolean().default(true),
        feeBandit: zod_1.z.boolean().default(true),
        constrainedSizing: zod_1.z.boolean().default(true),
        survivalStops: zod_1.z.boolean().default(true),
        offlinePolicyShadow: zod_1.z.boolean().default(true),
        jitoEnabled: zod_1.z.boolean().default(false),
        parquetExport: zod_1.z.boolean().default(false)
    })
        .default({
        migrationWatcher: true,
        rugGuard: true,
        alphaRanker: true,
        fillNet: true,
        feeBandit: true,
        constrainedSizing: true,
        survivalStops: true,
        offlinePolicyShadow: true,
        jitoEnabled: false,
        parquetExport: false
    }),
    addresses: zod_1.z
        .object({
        pumpfunProgram: zod_1.z.string().default(''),
        pumpswapProgram: zod_1.z.string().default(''),
        raydiumAmmV4: zod_1.z.string().default('675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW'),
        raydiumCpmm: zod_1.z.string().default('')
    })
        .default({ pumpfunProgram: '', pumpswapProgram: '', raydiumAmmV4: '675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW', raydiumCpmm: '' }),
    execution: zod_1.z.object({
        tipStrategy: zod_1.z.enum(['auto', 'manual']).default('auto'),
        computeUnitPriceMode: zod_1.z.enum(['auto_oracle', 'manual']).default('auto_oracle'),
        simpleMode: zod_1.z.boolean().default(true),
        jitoEnabled: zod_1.z.boolean().default(false),
        secondaryRpcEnabled: zod_1.z.boolean().default(false),
        wsEnabled: zod_1.z.boolean().default(false),
        feeArms: zod_1.z.array(zod_1.z.object({ cuPrice: zod_1.z.number().int().min(0), slippageBps: zod_1.z.number().int().positive() })).default([
            { cuPrice: 0, slippageBps: 50 },
            { cuPrice: 1000, slippageBps: 75 },
            { cuPrice: 3000, slippageBps: 100 },
            { cuPrice: 6000, slippageBps: 125 },
            { cuPrice: 10000, slippageBps: 150 }
        ]),
        minFillProb: zod_1.z.number().min(0).max(1).default(0.9),
        maxSlipBps: zod_1.z.number().int().positive().default(250),
        routeRetryMs: zod_1.z.number().int().positive().default(900),
        blockhashStaleMs: zod_1.z.number().int().positive().default(2500),
        migrationPreset: zod_1.z
            .object({
            enabled: zod_1.z.boolean().default(true),
            durationMs: zod_1.z.number().int().positive().default(60000),
            cuPriceBump: zod_1.z.number().int().nonnegative().default(3000),
            minSlippageBps: zod_1.z.number().int().positive().default(100),
            decayMs: zod_1.z.number().int().nonnegative().default(30000)
        })
            .default({ enabled: true, durationMs: 60000, cuPriceBump: 3000, minSlippageBps: 100, decayMs: 30000 }),
        routeQuarantine: zod_1.z
            .object({
            windowMinutes: zod_1.z.number().int().positive().default(1440),
            minAttempts: zod_1.z.number().int().positive().default(8),
            failRateThreshold: zod_1.z.number().min(0).max(1).default(0.25),
            slipExcessWeight: zod_1.z.number().nonnegative().default(0.5),
            failRateWeight: zod_1.z.number().nonnegative().default(100)
        })
            .default({ windowMinutes: 1440, minAttempts: 8, failRateThreshold: 0.25, slipExcessWeight: 0.5, failRateWeight: 100 })
    }).default({
        tipStrategy: 'auto',
        computeUnitPriceMode: 'auto_oracle',
        simpleMode: true,
        jitoEnabled: false,
        secondaryRpcEnabled: false,
        wsEnabled: false,
        feeArms: [
            { cuPrice: 0, slippageBps: 50 },
            { cuPrice: 1000, slippageBps: 75 },
            { cuPrice: 3000, slippageBps: 100 },
            { cuPrice: 6000, slippageBps: 125 },
            { cuPrice: 10000, slippageBps: 150 }
        ],
        minFillProb: 0.9,
        maxSlipBps: 250,
        routeRetryMs: 900,
        blockhashStaleMs: 2500,
        migrationPreset: { enabled: true, durationMs: 60000, cuPriceBump: 3000, minSlippageBps: 100, decayMs: 30000 },
        routeQuarantine: { windowMinutes: 1440, minAttempts: 8, failRateThreshold: 0.25, slipExcessWeight: 0.5, failRateWeight: 100 }
    }),
    jito: zod_1.z.object({
        tipLamportsMin: zod_1.z.number().int().min(0).default(0),
        tipLamportsMax: zod_1.z.number().int().min(0).default(0),
        bundleUrl: zod_1.z.string().default('')
    }).default({ tipLamportsMin: 0, tipLamportsMax: 0, bundleUrl: '' }),
    sizing: zod_1.z
        .object({
        baseUnitUsd: zod_1.z.number().positive().default(100),
        arms: zod_1.z
            .array(zod_1.z.object({ type: zod_1.z.enum(['equity_frac']), value: zod_1.z.number().positive() }))
            .default([
            { type: 'equity_frac', value: 0.005 },
            { type: 'equity_frac', value: 0.01 },
            { type: 'equity_frac', value: 0.02 }
        ]),
        dailyLossCapUsd: zod_1.z.number().nonnegative().default(500),
        perMintCapUsd: zod_1.z.number().nonnegative().default(400),
        coolOffL: zod_1.z.number().int().nonnegative().default(2)
    })
        .default({ baseUnitUsd: 100, arms: [{ type: 'equity_frac', value: 0.005 }, { type: 'equity_frac', value: 0.01 }, { type: 'equity_frac', value: 0.02 }], dailyLossCapUsd: 500, perMintCapUsd: 400, coolOffL: 2 }),
    survival: zod_1.z
        .object({
        baseTrailBps: zod_1.z.number().int().positive().default(120),
        minTrailBps: zod_1.z.number().int().positive().default(60),
        maxTrailBps: zod_1.z.number().int().positive().default(250),
        hardStopMaxLossBps: zod_1.z.number().int().positive().default(350),
        ladderLevels: zod_1.z.array(zod_1.z.number().min(0)).default([0.05, 0.12, 0.22]),
        hazardTighten: zod_1.z.number().min(0).max(1).default(0.65),
        hazardPanic: zod_1.z.number().min(0).max(1).default(0.85)
    })
        .default({ baseTrailBps: 120, minTrailBps: 60, maxTrailBps: 250, hardStopMaxLossBps: 350, ladderLevels: [0.05, 0.12, 0.22], hazardTighten: 0.65, hazardPanic: 0.85 }),
    shadow: zod_1.z
        .object({
        fee: zod_1.z.object({ method: zod_1.z.string().default('weighted_bc'), probFloor: zod_1.z.number().min(0).max(1).default(0.05) }).default({ method: 'weighted_bc', probFloor: 0.05 }),
        sizing: zod_1.z.object({ method: zod_1.z.string().default('weighted_bc'), probFloor: zod_1.z.number().min(0).max(1).default(0.05) }).default({ method: 'weighted_bc', probFloor: 0.05 })
    })
        .default({ fee: { method: 'weighted_bc', probFloor: 0.05 }, sizing: { method: 'weighted_bc', probFloor: 0.05 } }),
    leaderWallets: zod_1.z
        .object({
        enabled: zod_1.z.boolean().default(true),
        watchMinutes: zod_1.z.number().int().positive().default(5),
        minHitsForBoost: zod_1.z.number().int().nonnegative().default(1),
        scoreHalfLifeDays: zod_1.z.number().positive().default(14),
        rankBoost: zod_1.z.number().min(0).default(0.03),
        sizeTierBoost: zod_1.z.number().int().nonnegative().default(1)
    })
        .default({ enabled: true, watchMinutes: 5, minHitsForBoost: 1, scoreHalfLifeDays: 14, rankBoost: 0.03, sizeTierBoost: 1 }),
    alpha: zod_1.z
        .object({
        horizons: zod_1.z.array(zod_1.z.enum(['10m', '60m', '24h'])).default(['10m', '60m', '24h']),
        topK: zod_1.z.number().int().positive().default(12),
        minScore: zod_1.z.number().min(0).max(1).default(0.52)
    })
        .default({ horizons: ['10m', '60m', '24h'], topK: 12, minScore: 0.52 }),
    fillnet: zod_1.z
        .object({
        modelPath: zod_1.z.string().default('models/fillnet_v2.json'),
        minFillProb: zod_1.z.number().min(0).max(1).default(0.92),
        maxSlipBps: zod_1.z.number().int().positive().default(250)
    })
        .default({ modelPath: 'models/fillnet_v2.json', minFillProb: 0.92, maxSlipBps: 250 }),
    pnl: zod_1.z
        .object({
        useUsd: zod_1.z.boolean().default(true),
        solPriceSource: zod_1.z.enum(['birdeye']).default('birdeye'),
        includePriorityFee: zod_1.z.boolean().default(true)
    })
        .default({ useUsd: true, solPriceSource: 'birdeye', includePriorityFee: true })
});
//# sourceMappingURL=schema.js.map