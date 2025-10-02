import { listRecentSocialPosts, upsertAuthorFeature } from '../../packages/persistence/src/sqlite';

function computeQuality(posts: Array<{ author: string; text: string; ts: number; platform: string }>, minPosts: number): Map<string, { quality: number; count: number }> {
  const byAuthor = new Map<string, Array<{ text: string; ts: number }>>();
  for (const p of posts) {
    const arr = byAuthor.get(p.author) ?? [];
    arr.push({ text: p.text, ts: p.ts });
    byAuthor.set(p.author, arr);
  }
  const out = new Map<string, { quality: number; count: number }>();
  for (const [author, arr] of byAuthor.entries()) {
    const count = arr.length;
    if (count < minPosts) continue;
    const lengths = arr.map((x) => Math.min(280, x.text.length));
    const meanLen = lengths.reduce((a, b) => a + b, 0) / count;
    const quality = Math.min(1, (meanLen / 140) * Math.log1p(count) / Math.log1p(minPosts * 2));
    out.set(author, { quality, count });
  }
  return out;
}

async function main(): Promise<void> {
  const now = Date.now();
  // Insert fake posts via direct SQL if needed is non-trivial here; assume data exists or skip
  const since = now - 24 * 60 * 60 * 1000;
  const posts = listRecentSocialPosts(since);
  const agg = computeQuality(posts, 5);
  let sum = 0; let n = 0;
  for (const [author, row] of agg.entries()) {
    upsertAuthorFeature({ author, quality: row.quality, posts24h: row.count, lastCalcTs: now });
    sum += row.quality; n += 1;
  }
  const avg = n ? (sum / n) : 0;
  console.log(`features-smoke: authors=${n} avgQuality=${avg.toFixed(3)}`);
}

void main();

