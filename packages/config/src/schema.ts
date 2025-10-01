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
    metrics: z.object({ port: z.number().int().min(1).max(65535) }).default({ port: 8090 })
  }),
  gating: z.object({
    sssMin: z.number().min(0).max(1).default(0.6),
    ocrsMin: z.number().min(0).max(1).default(0.68),
    lpMinSol: z.number().min(0).default(20),
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
    autoSkimProfitSol: z.number().min(0).default(0.5),
    perNameCapFraction: z.number().min(0).max(1).default(0.3),
    perNameCapMaxSol: z.number().positive().default(5),
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
  execution: z
    .object({
      tipStrategy: z.enum(['auto', 'manual']).default('auto'),
      computeUnitPriceMode: z.enum(['auto_oracle', 'manual']).default('auto_oracle'),
      simpleMode: z.boolean().default(true),
      jitoEnabled: z.boolean().default(false),
      secondaryRpcEnabled: z.boolean().default(false),
      wsEnabled: z.boolean().default(false)
    })
    .default({ tipStrategy: 'auto', computeUnitPriceMode: 'auto_oracle', simpleMode: true, jitoEnabled: false, secondaryRpcEnabled: false, wsEnabled: false }),
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
    candidateFeedUrl: z.string().optional().nullable()
  }),

  policy: z.object({
    safeFeedUrl: z.string().optional().nullable(),
    blockedFeedUrl: z.string().optional().nullable(),
    contextWindowSec: z.number().int().positive().default(900),
    minOcrs: z.number().min(0).max(1).default(0.68),
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
      endpoints: z
        .object({ topics: z.string().default('/v2'), influencers: z.string().default('/v2') })
        .default({ topics: '/v2', influencers: '/v2' }),
      sssBias: z
        .object({ topicBoost: z.number().min(0).max(1).default(0.03), influencerBoost: z.number().min(0).max(1).default(0.02), maxBoost: z.number().min(0).max(1).default(0.06) })
        .default({ topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 })
    })
    .default({ enabled: true, baseUrl: 'https://api.lunarcrush.com', pollSec: 180, endpoints: { topics: '/v2', influencers: '/v2' }, sssBias: { topicBoost: 0.03, influencerBoost: 0.02, maxBoost: 0.06 } })
});

export type TrenchesConfig = z.infer<typeof configSchema>;
