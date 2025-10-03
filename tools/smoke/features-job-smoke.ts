import { getDb, storeSocialPost, getAuthorFeatures } from '../../packages/persistence/src/sqlite';
import { runFeaturesJobOnce } from '../../services/features-job/src/index';
import type { SocialPost } from '../../packages/shared/src/types';

const AUTHORS = ['smoke_author_alpha', 'smoke_author_beta'];

function createPost(author: string, text: string, timestamp: number): SocialPost {
  return {
    id: `${author}-${timestamp}`,
    platform: 'farcaster',
    authorId: author,
    authorHandle: author,
    text,
    lang: 'en',
    link: '',
    topics: [],
    tags: [],
    publishedAt: new Date(timestamp).toISOString(),
    capturedAt: new Date(timestamp).toISOString(),
    engagement: {},
    raw: {},
    source: 'features-smoke'
  };
}

async function main(): Promise<void> {
  const db = getDb();
  // Clear prior smoke artifacts
  db.prepare("DELETE FROM social_posts WHERE author_id LIKE 'smoke_author_%'").run();
  db.prepare("DELETE FROM author_features WHERE author LIKE 'smoke_author_%'").run();

  const now = Date.now();
  const offsets = [15, 45, 90, 160, 240, 360];
  for (const author of AUTHORS) {
    offsets.forEach((mins, idx) => {
      const ts = now - mins * 60 * 1000 - idx * 250;
      const text = `${author} signal ${idx} pump or dev update ${idx % 2 === 0 ? 'launch' : 'build'}`;
      storeSocialPost(createPost(author, text, ts));
    });
  }

  const stats = await runFeaturesJobOnce();
  const features = getAuthorFeatures(AUTHORS);
  const authorsSeen = Object.keys(features);
  const avgQuality = authorsSeen.length
    ? authorsSeen.reduce((sum, a) => sum + (features[a]?.quality ?? 0), 0) / authorsSeen.length
    : 0;
  console.log(
    `features-smoke: authors=${authorsSeen.length} avgQuality=${avgQuality.toFixed(3)} fallback=${stats.fallback}`
  );
}

void main();
