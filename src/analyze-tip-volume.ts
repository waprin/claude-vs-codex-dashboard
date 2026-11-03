import { createRedditClient } from './reddit-client.js';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const reddit = await createRedditClient();

const INPUT_FILE = 'claude_code_tips.jsonl';

interface TipPost {
  id: string;
  title: string;
  selftext: string;
  score: number;
  url: string;
  permalink: string;
  author: string;
  created: number;
  numComments: number;
  potentialTipScore: number;
}

/**
 * Load tip posts from discovery
 */
function loadTipPosts(): TipPost[] {
  if (!existsSync(INPUT_FILE)) {
    console.error(`No input file found: ${INPUT_FILE}`);
    return [];
  }

  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(line => JSON.parse(line));
}

/**
 * Sample comment counts from a few posts
 */
async function sampleCommentVolume(posts: TipPost[]): Promise<void> {
  console.log('📊 Sampling comment volumes...\n');

  // Sample different score ranges
  const sampleIndices = [0, 5, 10, 20, 30, 50, 75, 100, 150, 190].filter(i => i < posts.length);
  let totalSampledComments = 0;
  let sampledPosts = 0;

  for (const idx of sampleIndices) {
    const post = posts[idx];
    try {
      console.log(`Sampling: "${post.title}" (score: ${post.score})`);

      const submission = await reddit.getSubmission(post.id).fetch();
      await submission.expandReplies({ limit: Infinity, depth: 0 }); // Just top-level for speed

      const actualComments = submission.comments.filter((c: any) =>
        c.body && c.body !== '[deleted]' && c.body !== '[removed]'
      ).length;

      console.log(`  Reported: ${post.numComments} comments, Actual: ${actualComments} non-deleted\n`);

      totalSampledComments += actualComments;
      sampledPosts++;

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  Error sampling: ${error}\n`);
    }
  }

  const avgCommentsPerPost = totalSampledComments / sampledPosts;
  console.log(`\nAverage non-deleted comments per post: ${avgCommentsPerPost.toFixed(1)}`);
}

async function main() {
  console.log('🔍 Analyzing Claude Code Tips Volume\n');

  const posts = loadTipPosts();
  console.log(`Total posts discovered: ${posts.length}\n`);

  // Analyze score distribution
  const scoreRanges = {
    'high (100+)': posts.filter(p => p.score >= 100).length,
    'medium (20-99)': posts.filter(p => p.score >= 20 && p.score < 100).length,
    'low (5-19)': posts.filter(p => p.score >= 5 && p.score < 20).length,
    'very low (<5)': posts.filter(p => p.score < 5).length,
  };

  console.log('📊 Score Distribution:');
  Object.entries(scoreRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} posts`);
  });

  // Analyze total reported comments
  const totalReportedComments = posts.reduce((sum, p) => sum + p.numComments, 0);
  const avgCommentsPerPost = totalReportedComments / posts.length;

  console.log(`\n📊 Comment Volume (reported):`)
  console.log(`  Total reported comments: ${totalReportedComments.toLocaleString()}`);
  console.log(`  Average per post: ${avgCommentsPerPost.toFixed(1)}`);

  // Sort by score for filtering analysis
  posts.sort((a, b) => b.score - a.score);

  // Calculate cumulative comments at different cutoffs
  const cutoffs = [10, 25, 50, 75, 100, 150];
  console.log(`\n📊 Filtering Analysis (by top N posts):`);

  for (const cutoff of cutoffs) {
    if (cutoff > posts.length) continue;
    const topPosts = posts.slice(0, cutoff);
    const totalComments = topPosts.reduce((sum, p) => sum + p.numComments, 0);
    const minScore = topPosts[topPosts.length - 1].score;
    console.log(`  Top ${cutoff} posts: ~${totalComments} comments (min score: ${minScore})`);
  }

  // Calculate cost estimates
  console.log(`\n💰 Cost Estimates (using Claude Haiku at $0.25/1M input tokens):`);
  console.log(`  Assuming ~200 tokens per comment analysis:`);

  for (const cutoff of cutoffs) {
    if (cutoff > posts.length) continue;
    const topPosts = posts.slice(0, cutoff);
    const totalComments = topPosts.reduce((sum, p) => sum + p.numComments, 0);
    // Assume 70% are non-deleted (based on typical Reddit patterns)
    const actualComments = Math.floor(totalComments * 0.7);
    const totalTokens = actualComments * 200;
    const costUSD = (totalTokens / 1000000) * 0.25;
    console.log(`  Top ${cutoff} posts (~${actualComments} comments): $${costUSD.toFixed(2)}`);
  }

  // Sample actual comment volumes
  console.log('\n');
  await sampleCommentVolume(posts);

  // Recommend filtering strategy
  console.log('\n📋 Recommended Strategies:\n');
  console.log('1. HIGH QUALITY (Top 25-50 posts):');
  console.log('   - Focus on posts with 20+ upvotes');
  console.log('   - Analyze post content + top 5-10 comments each');
  console.log('   - Estimated cost: $0.50-$2.00');
  console.log('   - Best for finding proven, community-validated tips');

  console.log('\n2. COMPREHENSIVE (Top 100 posts):');
  console.log('   - Include posts with 5+ upvotes');
  console.log('   - Analyze all comments with 2+ upvotes');
  console.log('   - Estimated cost: $5-10');
  console.log('   - Better coverage but more noise');

  console.log('\n3. MIXED APPROACH (Recommended):');
  console.log('   - Top 25 posts: Analyze ALL comments');
  console.log('   - Next 25 posts: Only comments with 5+ upvotes');
  console.log('   - Posts 51-100: Only top 3 comments');
  console.log('   - Estimated cost: $2-4');
  console.log('   - Good balance of depth and coverage');
}

main().catch(console.error);