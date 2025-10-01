import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { configSchema, TrenchesConfig } from './schema';
import { deepMerge } from '@trenches/util';

export type { TrenchesConfig } from './schema';

let cachedConfig: TrenchesConfig | null = null;

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'default.yaml');

type EnvCaster = (value: string) => unknown;

type EnvMapping = [path: string, envKey: string, caster: EnvCaster];

function parseNumberList(value: string): number[] {
  return value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part))
    .filter((num) => Number.isFinite(num));
}

function parseStringList(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const baseConfig: TrenchesConfig = configSchema.parse({
  mode: 'FULL',
  logging: { level: 'info', json: true },
  services: {
    agentCore: { port: 4010 },
    executor: { port: 4011 },
    uiGateway: { port: 3000 },
    socialIngestor: { port: 4012 },
    onchainDiscovery: { port: 4013 },
    safetyEngine: { port: 4014 },
    policyEngine: { port: 4015 },
    positionManager: { port: 4016 },
    narrativeMiner: { port: 4017 },
    metrics: { port: 8090 }
  },
  gating: {
    sssMin: 0.6,
    ocrsMin: 0.68,
    lpMinSol: 20,
    buysSellRatioMin: 2.2,
    uniquesMin: 12,
    minPoolAgeSec: 30,
    maxSpreadBps: 150
  },
  watchWindows: {
    durationSec: 1_200,
    refreshIntervalSec: 5,
    decayHalfLifeSec: 120
  },
  topics: {
    cluster: { lshBands: 12, lshRows: 6, minCosine: 0.82, mergeMinObservations: 3 },
    scoring: {
      openThreshold: 0.6,
      sustainThreshold: 0.45,
      recencyHalfLifeSec: 120,
      noveltyEpsilon: 1e-6
    },
    phrase: {
      minLength: 3,
      maxLength: 48,
      stopwords: [
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
      ]
    },
    matching: { minTrieScore: 0.5, minCosine: 0.75, boostSymbolMatch: 0.15, coolDownSec: 60 },
    baseline: { halfLifeSec: 604_800, flushIntervalSec: 300 },
    test: { enabled: false }
  },
  ladders: {
    takeProfits: [1.5, 2, 3, 5],
    multiplierPercents: [50, 100, 200, 400],
    trailActivatePct: 60,
    trailPct: 28,
    hardStopLossPct: 22
  },
  bandit: {
    rewardHorizonMinutes: 30,
    updateIntervalSec: 20,
    epsilonFloor: 0.02,
    bundles: [
      { id: 'aggressive-entry', label: 'Aggressive Entry', gate: 'loose', slippageBps: 700, tipPercentile: 'p75', sizeMultiplier: 0.7 },
      { id: 'bulk-sniper', label: 'Bulk Sniper', gate: 'normal', slippageBps: 300, tipPercentile: 'p50', sizeMultiplier: 1 },
      { id: 'conservative', label: 'Conservative', gate: 'strict', slippageBps: 100, tipPercentile: 'p25', sizeMultiplier: 0.5 },
      { id: 'hvy-chase', label: 'HVY Chase', gate: 'loose', slippageBps: 850, tipPercentile: 'p90', sizeMultiplier: 0.85 }
    ]
  },
  wallet: {
    reservesSol: 0.02,
    dailySpendCapSol: 1.5,
    autoSkimProfitSol: 0.5,
    perNameCapFraction: 0.3,
    perNameCapMaxSol: 5,
    lpImpactCapFraction: 0.015,
    flowCapFraction: 0.4,
    equityTiers: [
      { minEquity: 0, maxEquity: 3, riskFraction: 0.12 },
      { minEquity: 3, maxEquity: 10, riskFraction: 0.12 },
      { minEquity: 10, maxEquity: 25, riskFraction: 0.08 },
      { minEquity: 25, maxEquity: 100, riskFraction: 0.05 },
      { minEquity: 100, maxEquity: null, riskFraction: 0.03 }
    ],
    concurrencyCap: 3,
    concurrencyScaler: { base: 1, max: 1.4, recoveryMinutes: 60 }
  },
  rpc: {
    primaryUrl: 'http://127.0.0.1:8899',
    secondaryUrl: '',
    wsUrl: '',
    jitoHttpUrl: '',
    jitoGrpcUrl: '',
    jupiterBaseUrl: 'https://quote-api.jup.ag/v6',
    httpHeaders: {}
  },
  dataProviders: {
    neynarBaseUrl: 'https://api.neynar.com',
    dexscreenerBaseUrl: 'https://api.dexscreener.com',
    birdeyeBaseUrl: 'https://public-api.birdeye.so',
    blueskyJetstreamUrl: 'wss://jetstream2.us-east.host.bsky.network',
    gdeltPulseUrl: 'https://api.gdeltproject.org/api/v2/summary/summary'
  },
  safety: {
    lpBurnThreshold: 0.9,
    holderTopCap: 0.2,
    lockerPrograms: [
      '6z7H14RTa7tD1ynjUTduV1JN9WewtGku5Kz4DKftd84f',
      'Lock111111111111111111111111111111111111111',
      '87AxbZcq7aj3HyCuXapnwXCfJLLq5yRvCNr4ieVsg7fR'
    ],
    ignoreAccounts: ['1nc1nerator11111111111111111111111111111111'],
    candidateFeedUrl: undefined
  },
  policy: {
    safeFeedUrl: undefined,
    blockedFeedUrl: undefined,
    contextWindowSec: 900,
    minOcrs: 0.68,
    minConfidence: 0.4,
    dailyLossCapPct: 0.1,
    rewardSmoothing: 0.2
  },
  caching: {
    dexscreenerPairsTtlSec: 10,
    dexscreenerTrendingTtlSec: 60,
    birdeyeMultiPriceTtlSec: 5,
    birdeyeTrendingTtlSec: 60,
    topicEmbeddingTtlSec: 600
  },
  alerts: {},
  persistence: {
    sqlitePath: './data/trenches.db',
    parquetDir: './data/parquet',
    parquetRollHours: 6
  },
  security: {
    killSwitchToken: undefined,
    allowRemoteKillSwitch: false
  },
  social: {
    neynar: { enabled: true, watchFids: [], keywords: [], pollIntervalSec: 15 },
    bluesky: { enabled: true, cursorPath: './data/bluesky.cursor', reconnectBackoffSec: 5 },
    reddit: { enabled: true, subreddits: ['solanamemes', 'memecoins', 'solana'], pollIntervalSec: 45 },
    telegram: { enabled: true, channels: [], downloadDir: './data/tdlib', pollIntervalSec: 10 },
    gdelt: { enabled: true, pollIntervalSec: 900 }
  }
});

function parseJsonRecord(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === 'string') {
          record[key] = val;
        } else {
          record[key] = String(val);
        }
      }
      return record;
    }
  } catch (err) {
    throw new Error(`Failed to parse SOLANA_RPC_HTTP_HEADERS: ${(err as Error).message}`);
  }
  throw new Error('SOLANA_RPC_HTTP_HEADERS must be a JSON object of string values');
}

const envMap: EnvMapping[] = [
  ['mode', 'AGENT_MODE', (v) => v],
  ['logging.level', 'LOG_LEVEL', (v) => v],
  ['services.agentCore.port', 'AGENT_CORE_PORT', (v) => Number(v)],
  ['services.executor.port', 'EXECUTOR_PORT', (v) => Number(v)],
  ['services.uiGateway.port', 'UI_PORT', (v) => Number(v)],
  ['services.socialIngestor.port', 'SOCIAL_INGESTOR_PORT', (v) => Number(v)],
  ['services.onchainDiscovery.port', 'ONCHAIN_DISCOVERY_PORT', (v) => Number(v)],
  ['services.safetyEngine.port', 'SAFETY_ENGINE_PORT', (v) => Number(v)],
  ['services.policyEngine.port', 'POLICY_ENGINE_PORT', (v) => Number(v)],
  ['services.positionManager.port', 'POSITION_MANAGER_PORT', (v) => Number(v)],
  ['services.narrativeMiner.port', 'NARRATIVE_MINER_PORT', (v) => Number(v)],
  ['services.metrics.port', 'HEALTH_PORT', (v) => Number(v)],
  ['rpc.primaryUrl', 'SOLANA_PRIMARY_RPC_URL', (v) => v],
  ['rpc.secondaryUrl', 'SOLANA_SECONDARY_RPC_URL', (v) => v],
  ['rpc.wsUrl', 'SOLANA_WS_URL', (v) => v],
  ['rpc.jitoHttpUrl', 'JITO_BLOCK_ENGINE_HTTP', (v) => v],
  ['rpc.jitoGrpcUrl', 'JITO_BLOCK_ENGINE_GRPC', (v) => v],
  ['rpc.jupiterBaseUrl', 'JUPITER_API_URL', (v) => v],
  ['rpc.httpHeaders', 'SOLANA_RPC_HTTP_HEADERS', parseJsonRecord],
  ['dataProviders.neynarBaseUrl', 'NEYNAR_BASE_URL', (v) => v],
  ['dataProviders.dexscreenerBaseUrl', 'DEXSCREENER_BASE_URL', (v) => v],
  ['dataProviders.birdeyeBaseUrl', 'BIRDEYE_BASE_URL', (v) => v],
  ['dataProviders.blueskyJetstreamUrl', 'BLUESKY_JETSTREAM_URL', (v) => v],
  ['dataProviders.gdeltPulseUrl', 'GDELT_PULSE_URL', (v) => v],
  ['providers.solanatracker.baseUrl', 'SOLANATRACKER_BASE_URL', (v) => v],
  ['persistence.sqlitePath', 'SQLITE_DB_PATH', (v) => v],
  ['persistence.parquetDir', 'PARQUET_OUTPUT_DIR', (v) => v],
  ['security.killSwitchToken', 'KILL_SWITCH_TOKEN', (v) => v],
  ['alerts.telegramChatId', 'TELEGRAM_ALERT_CHAT_ID', (v) => v],
  ['safety.candidateFeedUrl', 'SAFETY_CANDIDATE_FEED_URL', (v) => v],
  ['policy.safeFeedUrl', 'POLICY_SAFE_FEED_URL', (v) => v],
  ['policy.blockedFeedUrl', 'POLICY_BLOCKED_FEED_URL', (v) => v],
  ['social.neynar.watchFids', 'NEYNAR_WATCH_FIDS', parseNumberList],
  ['social.neynar.keywords', 'NEYNAR_KEYWORDS', parseStringList],
  ['social.neynar.pollIntervalSec', 'NEYNAR_POLL_SEC', (v) => Number(v)],
  ['social.reddit.subreddits', 'REDDIT_SUBREDDITS', parseStringList],
  ['social.reddit.pollIntervalSec', 'REDDIT_POLL_SEC', (v) => Number(v)],
  ['social.reddit.appType', 'REDDIT_APP_TYPE', (v) => (String(v).toLowerCase() === 'web' ? 'web' : 'installed')],
  ['social.reddit.appType', 'REDDIT_APP_TYPE', (v) => (v.toLowerCase() === 'web' ? 'web' : 'installed')],
  ['social.telegram.channels', 'TELEGRAM_CHANNELS', parseStringList],
  ['social.telegram.downloadDir', 'TELEGRAM_TDLIB_DB_PATH', (v) => v],
  ['social.telegram.pollIntervalSec', 'TELEGRAM_POLL_SEC', (v) => Number(v)],
  ['social.gdelt.pollIntervalSec', 'GDELT_POLL_SEC', (v) => Number(v)],
  ['topics.test.enabled', 'NARRATIVE_TEST_ENABLED', (v) => v === 'true'],
  ['topics.test.seed', 'NARRATIVE_TEST_SEED', (v) => Number(v)],
  ['topics.test.vectorizerModule', 'NARRATIVE_TEST_VECTORIZER_MODULE', (v) => v]
];

function setPath(target: Record<string, any>, dottedKey: string, value: unknown): void {
  const segments = dottedKey.split('.');
  let cursor: Record<string, any> = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (cursor[segment] === undefined) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }
  cursor[segments[segments.length - 1]] = value;
}

function loadFileConfig(customPath?: string): Record<string, unknown> {
  const pathToUse = customPath ?? process.env.TRENCHES_CONFIG ?? DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(pathToUse)) {
    if (pathToUse !== DEFAULT_CONFIG_PATH) {
      throw new Error(`Config file not found at ${pathToUse}`);
    }
    return {};
  }
  const raw = fs.readFileSync(pathToUse, 'utf-8');
  const parsed = YAML.parse(raw) ?? {};
  return parsed;
}

function applyEnv(config: TrenchesConfig): TrenchesConfig {
  const mutated: TrenchesConfig = JSON.parse(JSON.stringify(config));
  for (const [pathKey, envKey, caster] of envMap) {
    const envVal = process.env[envKey];
    if (envVal !== undefined && envVal !== '') {
      setPath(mutated as unknown as Record<string, unknown>, pathKey, caster(envVal));
    }
  }
  if (process.env.ALLOW_REMOTE_KILL_SWITCH) {
    mutated.security.allowRemoteKillSwitch = process.env.ALLOW_REMOTE_KILL_SWITCH === 'true';
  }
  return mutated;
}

export function loadConfig(options?: { forceReload?: boolean; configPath?: string }): TrenchesConfig {
  if (!options?.forceReload && cachedConfig) {
    return cachedConfig;
  }
  const fileConfig = loadFileConfig(options?.configPath);
  const merged = deepMerge(baseConfig, fileConfig as Record<string, unknown>);
  const parsed = configSchema.parse(merged);
  const withEnv = applyEnv(parsed);
  // Derive execution flags (read-only indicators)
  const jitoEnabled = Boolean(withEnv.rpc.jitoHttpUrl || withEnv.rpc.jitoGrpcUrl);
  const secondaryRpcEnabled = Boolean(withEnv.rpc.secondaryUrl);
  const wsEnabled = Boolean(withEnv.rpc.wsUrl);
  const simpleMode = !(jitoEnabled || secondaryRpcEnabled || wsEnabled);
  (withEnv as any).execution = {
    ...((withEnv as any).execution ?? {}),
    jitoEnabled,
    secondaryRpcEnabled,
    wsEnabled,
    simpleMode
  };
  cachedConfig = withEnv;
  return withEnv;
}

export function getConfig(): TrenchesConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
