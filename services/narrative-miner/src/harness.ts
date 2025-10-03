import { loadConfig } from '@trenches/config';
import { SocialPost, TokenCandidate } from '@trenches/shared';
import { createLogger } from '@trenches/logger';
import { createNarrativeMiner } from './index';
import { InMemoryNarrativePersistence } from './persistence';

const logger = createLogger('narrative-harness');


async function run(): Promise<void> {
  const baseConfig = loadConfig({ forceReload: true });
  const override = JSON.parse(JSON.stringify(baseConfig));
  override.watchWindows.durationSec = 30;
  override.watchWindows.refreshIntervalSec = 1;
  override.topics.test = override.topics.test ?? { enabled: true };
  override.topics.test.enabled = true;
  override.topics.test.seed = 1337;
  override.persistence.sqlitePath = ':memory:';

  const persistence = new InMemoryNarrativePersistence();
  const miner = await createNarrativeMiner({
    persistence,
    disableStreams: true,
    startHttp: false,
    configOverride: override,
    deterministicOverride: { seed: 1337 }
  });

  miner.bus.onTopic((event) => {
    logger.info({ event }, 'topic event');
  });
  miner.bus.onCandidate((candidate) => {
    logger.info({ candidate }, 'candidate event');
  });

  const now = Date.now();
  for (let i = 0; i < 6; i += 1) {
    const post: SocialPost = {
      id: `post-${i}`,
      platform: 'farcaster',
      authorId: `author-${i}`,
      text: 'DJT is ripping to the moon',
      publishedAt: new Date(now + i * 1000).toISOString(),
      capturedAt: new Date(now + i * 1000).toISOString(),
      engagement: {
        likes: 120 + i * 5,
        reposts: 40 + i * 2,
        replies: 10,
        impressions: 5000
      },
      raw: {},
      source: 'harness'
    } as SocialPost;
    await miner.processSocial(post);
  }

  await pause(750);

  const candidate: TokenCandidate = {
    t: 'token_candidate',
    mint: 'DJT123456789',
    name: 'DJT',
    symbol: 'DJT',
    source: 'raydium',
    ageSec: 25,
    lpSol: 60,
    buys60: 240,
    sells60: 60,
    uniques60: 48,
    spreadBps: 55,
    safety: { ok: true, reasons: [] },
    poolAddress: 'PoolAddress',
    lpMint: 'LpMint',
    poolCoinAccount: 'CoinAcct',
    poolPcAccount: 'PcAcct'
  };

  await miner.processCandidate(candidate);

  await pause(2000);

  logger.info({ topics: persistence.topics.length, matches: persistence.matches.length }, 'harness complete');
  await miner.shutdown('harness complete');
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((err) => {
  logger.error({ err }, 'harness run failed');
  process.exit(1);
});
