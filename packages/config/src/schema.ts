import { z } from 'zod';

export const concurrencyScalerSchema = z.object({
  base: z.number().min(0),
  max: z.number().min(0),
  recoveryMinutes: z.number().min(1)
});

export const equityTierSchema = z.object({
  minEquity: z.number().nonnegative(),
  maxEquity: z.number().nullable(),
  riskFraction: z.number().min(0).max(1)
});

export const banditBundleSchema = z.object({
  id: z.string(),
  label: z.string(),
  gate: z.enum(['strict', 'normal', 'loose']),
  slippageBps: z.number().int().positive(),
  tipPercentile: z.enum(['p25', 'p50', 'p75', 'p90']),
  sizeMultiplier: z.number().min(0.1),
  notes: z.string().optional()
});

export const socialConfigSchema = z.object({
  neynar: z.object({
    enabled: z.boolean().default(true),
    watchFids: z.array(z.number()).default([]),
    keywords: z.array(z.string()).default([]),
    pollIntervalSec: z.number().int().positive().default(15)
  }),
  bluesky: z.object({
    enabled: z.boolean().default(true),
    cursorPath: z.string().default('./data/bluesky.cursor'),
    reconnectBackoffSec: z.number().int().positive().default(5)
  }),
  reddit: z.object({
    enabled: z.boolean().default(true),
    subreddits: z.array(z.string()).default(['solanamemes', 'memecoins', 'solana']),
    pollIntervalSec: z.number().int().positive().default(45),
    appType: z.enum(['installed', 'web']).default('installed')
  }),
  telegram: z.object({
    enabled: z.boolean().default(true),
    channels: z.array(z.string()).default([]),
    downloadDir: z.string().default('./data/tdlib'),
    pollIntervalSec: z.number().int().positive().default(10)
  }),
  gdelt: z.object({
    enabled: z.boolean().default(true),
    pollIntervalSec: z.number().int().positive().default(900)
  })
});

export const tradingSchema = z.object({
  maxOpenPositions: z.number().int().positive().default(15),
  maxDailyNew: z.number().int().positive().default(120)
}).default({ maxOpenPositions: 15, maxDailyNew: 120 });

export const configSchema = z.object({
  mode: z.enum(['SIM', 'SHADOW', 'SEMI', 'FULL']).default('SIM'),
  logging: z.object({
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    json: z.boolean().default(true)
  }).default({ level: 'info', json: true }),
  services: z.object({
    agentCore: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4010 }),
    executor: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4011 }),
    uiGateway: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 3000 }),
    socialIngestor: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4012 }),
    onchainDiscovery: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4013 }),
    safetyEngine: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4014 }),
    policyEngine: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4015 }),
    positionManager: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4016 }),
    narrativeMiner: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4017 }),
    migrationWatcher: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4018 }),
    leaderWallets: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4019 }),
    featuresJob: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 4020 }),
    metrics: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 8090 })
  }),
  gating: z.object({lpMinSol: z.number().min(0).default(20),
    buysSellRatioMin: z.number().min(0).default(2.2),
    uniquesMin: z.number().min(0).default(12),
    minPoolAgeSec: z.number().min(0).default(30),
    maxSpreadBps: z.number().min(0).default(150)
  }),
  watchWindows: z.object({
    durationSec: z.number().min(60).default(1200),
    refreshIntervalSec: z.number().min(1).default(5),
    decayHalfLifeSec: z.number().min(1).default(120)
  }),
  topics: z.object({
    cluster: z.object({
      lshBands: z.number().int().positive().default(12),
      lshRows: z.number().int().positive().default(6),
      minCosine: z.number().min(0).max(1).default(0.82),
      mergeMinObservations: z.number().int().positive().default(3)
    }),
    scoring: z.object({
      openThreshold: z.number().min(0).max(1).default(0.6),
      sustainThreshold: z.number().min(0).max(1).default(0.45),
      recencyHalfLifeSec: z.number().int().positive().default(120),
      noveltyEpsilon: z.number().positive().default(1e-6)
    }),
    phrase: z.object({
      minLength: z.number().int().positive().default(3),
      maxLength: z.number().int().positive().default(48),
      stopwords: z.array(z.string()).default([
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
    matching: z.object({
      minTrieScore: z.number().min(0).max(1).default(0.5),
      minCosine: z.number().min(0).max(1).default(0.75),
      boostSymbolMatch: z.number().min(0).max(1).default(0.15),
      coolDownSec: z.number().int().positive().default(60)
    }),
    baseline: z.object({
      halfLifeSec: z.number().int().positive().default(604800),
      flushIntervalSec: z.number().int().positive().default(300)
    }),
    test: z
      .object({
        enabled: z.boolean().default(false),
        seed: z.number().int().nonnegative().optional(),
        vectorizerModule: z.string().optional()
      })
      .default({ enabled: false })
  }),
  ladders: z.object({
    takeProfits: z.array(z.number().positive()).default([1.5, 2, 3, 5]),
    multiplierPercents: z.array(z.number().positive()).default([50, 100, 200, 400]),
    trailActivatePct: z.number().min(0).default(60),
    trailPct: z.number().min(0).default(28),
    hardStopLossPct: z.number().min(0).default(22)
  }),
  bandit: z.object({
    rewardHorizonMinutes: z.number().int().positive().default(30),
    updateIntervalSec: z.number().int().positive().default(20),
    epsilonFloor: z.number().min(0).max(1).default(0.02),
    bundles: z.array(banditBundleSchema).min(4)
  }),
  wallet: z.object({
    reservesSol: z.number().min(0).default(0.02),
    dailySpendCapSol: z.number().min(0).default(1.5),
    dailySpendCapPct: z.number().min(0).max(1).optional(), // Percentage-based daily spending
    autoSkimProfitSol: z.number().min(0).default(0.5),
    perNameCapFraction: z.number().min(0).max(1).default(0.3),
    perNameCapMaxSol: z.number().positive().nullable().default(5),
    lpImpactCapFraction: z.number().min(0).max(1).default(0.015),
    flowCapFraction: z.number().min(0).max(1).default(0.4),
    equityTiers: z.array(equityTierSchema),
    concurrencyCap: z.number().int().positive().default(3),
    concurrencyScaler: concurrencyScalerSchema.default({ base: 1, max: 1.4, recoveryMinutes: 60 })
  }),
  rpc: z.object({
    primaryUrl: z.string().url().or(z.literal('')).default('http://127.0.0.1:8899'),
    secondaryUrl: z.string().url().or(z.literal('')).default(''),
    wsUrl: z.string().url().or(z.literal('')).default(''),
    jitoHttpUrl: z.string().url().or(z.literal('')).default(''),
    jitoGrpcUrl: z.string().url().or(z.literal('')).default(''),
    jupiterBaseUrl: z.string().url().default('https://quote-api.jup.ag/v6'),
    httpHeaders: z.record(z.string(), z.string()).default({})
  }),
  dataProviders: z.object({
    neynarBaseUrl: z.string().url().default('https://api.neynar.com'),
    dexscreenerBaseUrl: z.string().url().default('https://api.dexscreener.com'),
    birdeyeBaseUrl: z.string().url().default('https://public-api.birdeye.so'),
    blueskyJetstreamUrl: z.string().url().default('wss://jetstream2.us-east.host.bsky.network'),
    gdeltPulseUrl: z.string().url().default('https://api.gdeltproject.org/api/v2/summary/summary')
  }),
  providers: z
    .object({
      solanatracker: z
        .object({
          enabled: z.boolean().default(true),
          baseUrl: z.string().url().default('https://api.solanatracker.io'),
          pollSec: z.number().int().positive().default(8),
          ttlSec: z.number().int().positive().default(10),
          endpoints: z
            .object({
              trending: z.boolean().default(true),
              latest: z.boolean().default(true),
              launchpads: z.object({ pumpfun: z.boolean().default(true), jupstudio: z.boolean().default(true) }).default({ pumpfun: true, jupstudio: true })
            })
            .default({ trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } })
        })
        .default({ enabled: true, baseUrl: 'https://api.solanatracker.io', pollSec: 8, ttlSec: 10, endpoints: { trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } } })
    })
    .default({
      solanatracker: { enabled: true, baseUrl: 'https://api.solanatracker.io', pollSec: 8, ttlSec: 10, endpoints: { trending: true, latest: true, launchpads: { pumpfun: true, jupstudio: true } } }
    }),
  safety: z.object({
    lpBurnThreshold: z.number().min(0).max(1).default(0.9),
    holderTopCap: z.number().min(0).max(1).default(0.2),
    lockerPrograms: z.array(z.string()).default([
      '6z7H14RTa7tD1ynjUTduV1JN9WewtGku5Kz4DKftd84f',
      'Lock111111111111111111111111111111111111111',
      '87AxbZcq7aj3HyCuXapnwXCfJLLq5yRvCNr4ieVsg7fR'
    ]),
    ignoreAccounts: z.array(z.string()).default([
      '1nc1nerator11111111111111111111111111111111'
    ]),
    candidateFeedUrl: z.string().optional().nullable(),
    fastEntry: z.object({
      sssThreshold: z.number().min(0).default(6.0),
      velocityThreshold: z.number().min(0).default(2.5),
      minimumChecks: z.object({
        lpMinSol: z.number().min(0).default(12),
        uniquesMin: z.number().min(0).default(8),
        lpBurnThreshold: z.number().min(0).max(1).default(0.6),
        maxRugProb: z.number().min(0).max(1).default(0.9),
        holderTopCap: z.number().min(0).max(1).default(0.4)
      }).default({
        lpMinSol: 12,
        uniquesMin: 8,
        lpBurnThreshold: 0.6,
        maxRugProb: 0.9,
        holderTopCap: 0.4
      })
    }).default({
      sssThreshold: 6.0,
      velocityThreshold: 2.5,
      minimumChecks: {
        lpMinSol: 12,
        uniquesMin: 8,
        lpBurnThreshold: 0.6,
        maxRugProb: 0.9,
        holderTopCap: 0.4
      }
    })
  }),

  policy: z.object({
    safeFeedUrl: z.string().optional().nullable(),
    blockedFeedUrl: z.string().optional().nullable(),
    contextWindowSec: z.number().int().positive().default(900),
    minConfidence: z.number().min(0).max(1).default(0.4),
    dailyLossCapPct: z.number().min(0).max(1).default(0.1),
    rewardSmoothing: z.number().min(0).max(1).default(0.2)
  }),

  caching: z.object({
    dexscreenerPairsTtlSec: z.number().int().positive().default(10),
    dexscreenerTrendingTtlSec: z.number().int().positive().default(60),
    birdeyeMultiPriceTtlSec: z.number().int().positive().default(5),
    birdeyeTrendingTtlSec: z.number().int().positive().default(60),
    topicEmbeddingTtlSec: z.number().int().positive().default(600)
  }),
  alerts: z.object({
    telegramChatId: z.string().optional(),
    pagerdutyRoutingKey: z.string().optional()
  }).default({}),
  persistence: z.object({
    sqlitePath: z.string().default('./data/trenches.db'),
    parquetDir: z.string().default('./data/parquet'),
    parquetRollHours: z.number().positive().default(6)
  }),
  security: z.object({
    killSwitchToken: z.string().optional(),
    allowRemoteKillSwitch: z.boolean().default(false)
  }).default({ allowRemoteKillSwitch: false }),
  social: socialConfigSchema
  ,
  lunarcrush: z
    .object({
      enabled: z.boolean().default(true),
      baseUrl: z.string().url().default('https://api.lunarcrush.com'),
      pollSec: z.number().int().positive().default(180),
      mcpSseUrl: z.union([z.string().url(), z.literal('')]).default(''),
      endpoints: z
        .object({ topics: z.string().default('/v2'), influencers: z.string().default('/v2') })
        .default({ topics: '/v2', influencers: '/v2' }),
      sssBias: z
        .object({ topicBoost: z.number().min(0).max(1).default(0.03), influencerBoost: z.number().min(0).max(1).default(0.02), maxBoost: z.number().min(0).max(1).default(0.06) })
        .default({ topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 })
    })
    .default({ enabled: true, baseUrl: 'https://api.lunarcrush.com', pollSec: 180, mcpSseUrl: '', endpoints: { topics: '/v2', influencers: '/v2' }, sssBias: { topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 } }),
  pyth: z
    .object({
      solUsdAccount: z.string().default('')
    })
    .default({ solUsdAccount: '' }),

  priceUpdater: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().positive().default(60_000),
      staleWarnSec: z.number().int().positive().default(300),
      pythSolUsdPriceAccount: z.string().default('')
    })
    .default({ enabled: true, intervalMs: 60_000, staleWarnSec: 300, pythSolUsdPriceAccount: '' }),
  featuresJob: z
    .object({
      enabled: z.boolean().default(true),
      intervalMs: z.number().int().positive().default(86_400_000),
      embedder: z.string().default('bge-small-en'),
      lookbackHours: z.number().int().positive().default(24),
      minPostsPerAuthor: z.number().int().positive().default(5)
    })
    .default({ enabled: true, intervalMs: 86_400_000, embedder: 'bge-small-en', lookbackHours: 24, minPostsPerAuthor: 5 }),
  features: z
    .object({
      migrationWatcher: z.boolean().default(true),
      rugGuard: z.boolean().default(true),
      alphaRanker: z.boolean().default(true),
      fillNet: z.boolean().default(true),
      feeBandit: z.boolean().default(true),
      constrainedSizing: z.boolean().default(true),
      survivalStops: z.boolean().default(true),
      offlinePolicyShadow: z.boolean().default(true),
      jitoEnabled: z.boolean().default(false),
      parquetExport: z.boolean().default(false)
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
  addresses: z
    .object({
      pumpfunProgram: z.string().default(''),
      pumpswapProgram: z.string().default(''),
      raydiumAmmV4: z.string().default('675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW'),
      raydiumCpmm: z.string().default('')
    })
    .default({ pumpfunProgram: '', pumpswapProgram: '', raydiumAmmV4: '675kPX9MHTjS2bSadfieDmpub5hm111B9S9N6fRqhNW', raydiumCpmm: '' }),
  execution: z.object({
    tipStrategy: z.enum(['auto', 'manual']).default('auto'),
    computeUnitPriceMode: z.enum(['auto_oracle', 'manual']).default('auto_oracle'),
    simpleMode: z.boolean().default(true),
    jito: z
      .object({ enabled: z.boolean().default(false), bundleUrl: z.string().default('') })
      .default({ enabled: false, bundleUrl: '' }),
    jitoEnabled: z.boolean().default(false),
    secondaryRpcEnabled: z.boolean().default(false),
    wsEnabled: z.boolean().default(false),
    feeArms: z.array(z.object({ cuPrice: z.number().int().min(0), slippageBps: z.number().int().positive() })).default([
      { cuPrice: 0, slippageBps: 50 },
      { cuPrice: 1000, slippageBps: 75 },
      { cuPrice: 3000, slippageBps: 100 },
      { cuPrice: 6000, slippageBps: 125 },
      { cuPrice: 10000, slippageBps: 150 }
    ]),
    minFillProb: z.number().min(0).max(1).default(0.9),
    maxSlipBps: z.number().int().positive().default(250),
    routeRetryMs: z.number().int().positive().default(900),
    blockhashStaleMs: z.number().int().positive().default(2500),
    migrationPreset: z
      .object({
        enabled: z.boolean().default(true),
        durationMs: z.number().int().positive().default(60000),
        cuPriceBump: z.number().int().nonnegative().default(3000),
        minSlippageBps: z.number().int().positive().default(100),
        decayMs: z.number().int().nonnegative().default(30000)
      })
      .default({ enabled: true, durationMs: 60000, cuPriceBump: 3000, minSlippageBps: 100, decayMs: 30000 }),
    routeQuarantine: z
      .object({
        windowMinutes: z.number().int().positive().default(1440),
        minAttempts: z.number().int().positive().default(8),
        failRateThreshold: z.number().min(0).max(1).default(0.25),
        slipExcessWeight: z.number().nonnegative().default(0.5),
        failRateWeight: z.number().nonnegative().default(100)
      })
      .default({ windowMinutes: 1440, minAttempts: 8, failRateThreshold: 0.25, slipExcessWeight: 0.5, failRateWeight: 100 })
  }).default({
    tipStrategy: 'auto',
    computeUnitPriceMode: 'auto_oracle',
    simpleMode: true,
    jito: { enabled: false, bundleUrl: '' },
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
  jito: z.object({
    tipLamportsMin: z.number().int().min(0).default(0),
    tipLamportsMax: z.number().int().min(0).default(0),
    bundleUrl: z.string().default('')
  }).default({ tipLamportsMin: 0, tipLamportsMax: 0, bundleUrl: '' }),
  sizing: z
    .object({
      baseUnitUsd: z.number().positive().default(100),
      arms: z
        .array(
          z.object({ type: z.enum(['equity_frac']), value: z.number().positive() })
        )
        .default([
          { type: 'equity_frac', value: 0.005 },
          { type: 'equity_frac', value: 0.01 },
          { type: 'equity_frac', value: 0.02 }
        ]),
      dailyLossCapUsd: z.number().nonnegative().default(500),
      perMintCapUsd: z.number().nonnegative().default(400),
      coolOffL: z.number().int().nonnegative().default(2),
      minFreeSol: z.number().nonnegative().optional()
    })
    .default({ baseUnitUsd: 100, arms: [{ type: 'equity_frac', value: 0.005 }, { type: 'equity_frac', value: 0.01 }, { type: 'equity_frac', value: 0.02 }], dailyLossCapUsd: 500, perMintCapUsd: 400, coolOffL: 2, minFreeSol: undefined }),
  trading: tradingSchema,
  survival: z
    .object({
      baseTrailBps: z.number().int().positive().default(120),
      minTrailBps: z.number().int().positive().default(60),
      maxTrailBps: z.number().int().positive().default(250),
      hardStopMaxLossBps: z.number().int().positive().default(350),
      ladderLevels: z.array(z.number().min(0)).default([0.05, 0.12, 0.22]),
      hazardTighten: z.number().min(0).max(1).default(0.65),
      hazardPanic: z.number().min(0).max(1).default(0.85)
    })
    .default({ baseTrailBps: 120, minTrailBps: 60, maxTrailBps: 250, hardStopMaxLossBps: 350, ladderLevels: [0.05, 0.12, 0.22], hazardTighten: 0.65, hazardPanic: 0.85 })
  ,
  shadow: z
    .object({
      fee: z.object({ method: z.string().default('weighted_bc'), probFloor: z.number().min(0).max(1).default(0.05) }).default({ method: 'weighted_bc', probFloor: 0.05 }),
      sizing: z.object({ method: z.string().default('weighted_bc'), probFloor: z.number().min(0).max(1).default(0.05) }).default({ method: 'weighted_bc', probFloor: 0.05 })
    })
    .default({ fee: { method: 'weighted_bc', probFloor: 0.05 }, sizing: { method: 'weighted_bc', probFloor: 0.05 } })
  ,
  leaderWallets: z
    .object({
      enabled: z.boolean().default(true),
      watchMinutes: z.number().int().positive().default(5),
      minHitsForBoost: z.number().int().nonnegative().default(1),
      scoreHalfLifeDays: z.number().positive().default(14),
      rankBoost: z.number().min(0).default(0.03),
      sizeTierBoost: z.number().int().nonnegative().default(1)
    })
    .default({ enabled: true, watchMinutes: 5, minHitsForBoost: 1, scoreHalfLifeDays: 14, rankBoost: 0.03, sizeTierBoost: 1 })
  ,
  alpha: z
    .object({
      horizons: z.array(z.enum(['10m','60m','24h'])).default(['10m','60m','24h']),
      topK: z.number().int().positive().default(12),
      minScore: z.number().min(0).max(1).default(0.52)
    })
    .default({ horizons: ['10m','60m','24h'], topK: 12, minScore: 0.52 }),
  fillnet: z
    .object({
      modelPath: z.string().default('models/fillnet_v2.json'),
      minFillProb: z.number().min(0).max(1).default(0.92),
      maxSlipBps: z.number().int().positive().default(250)
    })
    .default({ modelPath: 'models/fillnet_v2.json', minFillProb: 0.92, maxSlipBps: 250 }),
  pnl: z
    .object({
      useUsd: z.boolean().default(true),
      solPriceSource: z.enum(['birdeye']).default('birdeye'),
      includePriorityFee: z.boolean().default(true)
    })
    .default({ useUsd: true, solPriceSource: 'birdeye', includePriorityFee: true })
});

export type TrenchesConfig = z.infer<typeof configSchema>;


