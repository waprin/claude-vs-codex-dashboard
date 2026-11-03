import { createRedditClient } from './reddit-client.js';
import { config } from 'dotenv';
import { writeFileSync, existsSync, readFileSync } from 'fs';

config();

// Reddit setup
const reddit = await createRedditClient();

// Google setup
const GOOGLE_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_KEY;
const GOOGLE_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX;

const OUTPUT_FILE = 'discovered_tip_posts.jsonl';

interface DiscoveredPost {
  postId: string;
  url: string;
  title: string;
  score: number;
  numComments: number;
  created: number;
  source: string; // 'reddit_new' | 'reddit_top' | 'google_<query>'
  discoveredAt: number;
}

// Google search queries for targeted discovery
const GOOGLE_QUERIES = [
  // Feature-specific
  'site:reddit.com/r/ClaudeCode hooks',
  'site:reddit.com/r/ClaudeCode MCP server',
  'site:reddit.com/r/ClaudeCode plugins OR skills',
  'site:reddit.com/r/ClaudeCode subagents',
  'site:reddit.com/r/ClaudeCode ".claude" OR "CLAUDE.md"',
  'site:reddit.com/r/ClaudeCode memory context',
  'site:reddit.com/r/ClaudeCode plan mode',
  'site:reddit.com/r/ClaudeCode max_tokens OR thinking',
  // Collection threads
  'site:reddit.com/r/ClaudeCode "best tip" OR "top tips"',
  'site:reddit.com/r/ClaudeCode "your workflow"',
  'site:reddit.com/r/ClaudeCode "how are you using"',
  'site:reddit.com/r/ClaudeCode "game changer"',
  'site:reddit.com/r/ClaudeCode "learned" OR "discovered"',
  'site:reddit.com/r/ClaudeCode "underrated" OR "hidden"',
];

/**
 * Load existing discovered posts to dedupe
 */
function loadExistingPosts(): Map<string, DiscoveredPost> {
  const posts = new Map<string, DiscoveredPost>();

  if (!existsSync(OUTPUT_FILE)) {
    return posts;
  }

  const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const post = JSON.parse(line) as DiscoveredPost;
      posts.set(post.postId, post);
    } catch (e) {
      // Skip malformed lines
    }
  }

  return posts;
}

/**
 * Save a discovered post
 */
function savePost(post: DiscoveredPost) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(post) + '\n', { flag: 'a' });
}

/**
 * Extract post ID from Reddit URL
 */
function extractPostId(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/\w+\/comments\/(\w+)/);
  return match ? match[1] : null;
}

/**
 * Fetch posts via Reddit API using getNew()
 */
async function discoverRedditNew(): Promise<DiscoveredPost[]> {
  console.log('\n📡 Reddit: Fetching via getNew()...');

  const subreddit = reddit.getSubreddit('ClaudeCode');
  const discovered: DiscoveredPost[] = [];
  let after: string | undefined = undefined;
  let batch = 0;

  while (true) {
    batch++;
    const posts = await subreddit.getNew({ limit: 100, after });

    if (posts.length === 0) break;

    for (const post of posts) {
      discovered.push({
        postId: post.id,
        url: `https://reddit.com${post.permalink}`,
        title: post.title,
        score: post.score,
        numComments: post.num_comments,
        created: post.created_utc,
        source: 'reddit_new',
        discoveredAt: Date.now(),
      });
    }

    after = posts[posts.length - 1].name;
    console.log(`  Batch ${batch}: ${posts.length} posts (total: ${discovered.length})`);

    await new Promise(r => setTimeout(r, 1000));

    // Reddit API limit
    if (discovered.length >= 1000) break;
  }

  console.log(`  ✓ Found ${discovered.length} posts via getNew()`);
  return discovered;
}

/**
 * Fetch posts via Reddit API using getTop()
 */
async function discoverRedditTop(): Promise<DiscoveredPost[]> {
  console.log('\n📡 Reddit: Fetching via getTop({ time: "all" })...');

  const subreddit = reddit.getSubreddit('ClaudeCode');
  const discovered: DiscoveredPost[] = [];
  let after: string | undefined = undefined;
  let batch = 0;

  while (true) {
    batch++;
    const posts = await subreddit.getTop({ time: 'all', limit: 100, after });

    if (posts.length === 0) break;

    for (const post of posts) {
      discovered.push({
        postId: post.id,
        url: `https://reddit.com${post.permalink}`,
        title: post.title,
        score: post.score,
        numComments: post.num_comments,
        created: post.created_utc,
        source: 'reddit_top',
        discoveredAt: Date.now(),
      });
    }

    after = posts[posts.length - 1].name;
    console.log(`  Batch ${batch}: ${posts.length} posts (total: ${discovered.length})`);

    await new Promise(r => setTimeout(r, 1000));

    if (discovered.length >= 1000) break;
  }

  console.log(`  ✓ Found ${discovered.length} posts via getTop()`);
  return discovered;
}

/**
 * Search Google for a query
 */
async function searchGoogle(query: string, startIndex: number = 1): Promise<{ links: string[], total: number }> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY!);
  url.searchParams.set('cx', GOOGLE_CX!);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('start', startIndex.toString());

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const total = data.searchInformation?.totalResults ? parseInt(data.searchInformation.totalResults) : 0;

  if (!data.items) {
    return { links: [], total };
  }

  const links = data.items.map((item: any) => item.link);
  return { links, total };
}

/**
 * Discover posts via Google Custom Search
 */
async function discoverGoogle(): Promise<DiscoveredPost[]> {
  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    console.log('\n⚠️  Google: Skipping (GOOGLE_CUSTOM_SEARCH_KEY or GOOGLE_CUSTOM_SEARCH_CX not set)');
    return [];
  }

  console.log('\n📡 Google: Running targeted searches...');

  const discovered: DiscoveredPost[] = [];
  let queriesUsed = 0;

  for (const query of GOOGLE_QUERIES) {
    console.log(`\n  Query: "${query}"`);

    try {
      // Get first 30 results (3 pages) per query
      for (let start = 1; start <= 21; start += 10) {
        const { links, total } = await searchGoogle(query, start);
        queriesUsed++;

        if (start === 1) {
          console.log(`    Total available: ${total}`);
        }

        if (links.length === 0) break;

        for (const link of links) {
          const postId = extractPostId(link);
          if (!postId) continue;

          discovered.push({
            postId,
            url: link,
            title: '', // Will be filled in during scraping
            score: 0,
            numComments: 0,
            created: 0,
            source: `google_${query.slice(0, 30)}`,
            discoveredAt: Date.now(),
          });
        }

        console.log(`    Page ${Math.ceil(start / 10)}: ${links.length} results`);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error: any) {
      console.log(`    ✗ Error: ${error.message}`);
    }
  }

  console.log(`\n  ✓ Found ${discovered.length} posts via Google (${queriesUsed} queries used)`);
  return discovered;
}

/**
 * Dedupe posts, keeping the one with best metadata
 */
function dedupePosts(posts: DiscoveredPost[]): DiscoveredPost[] {
  const byId = new Map<string, DiscoveredPost>();

  for (const post of posts) {
    const existing = byId.get(post.postId);

    if (!existing) {
      byId.set(post.postId, post);
    } else {
      // Prefer the one with more metadata (score, title, etc.)
      if (post.score > existing.score || (post.title && !existing.title)) {
        byId.set(post.postId, { ...existing, ...post, source: existing.source });
      }
    }
  }

  return Array.from(byId.values());
}

async function main() {
  console.log('🔍 Discovering Claude Code Tips - Combined Sources\n');
  console.log('=' .repeat(50));

  // Check for existing data
  const existingPosts = loadExistingPosts();
  if (existingPosts.size > 0) {
    console.log(`\n📂 Found ${existingPosts.size} existing posts in ${OUTPUT_FILE}`);
    console.log('   Will dedupe against existing data\n');
  }

  // Collect from all sources
  const allPosts: DiscoveredPost[] = [];

  // 1. Reddit getNew()
  const newPosts = await discoverRedditNew();
  allPosts.push(...newPosts);

  // 2. Reddit getTop()
  const topPosts = await discoverRedditTop();
  allPosts.push(...topPosts);

  // 3. Google searches
  const googlePosts = await discoverGoogle();
  allPosts.push(...googlePosts);

  // Dedupe
  console.log('\n📊 Deduplicating...');
  const uniquePosts = dedupePosts(allPosts);
  console.log(`  Raw total: ${allPosts.length}`);
  console.log(`  After dedupe: ${uniquePosts.length}`);

  // Filter out already-saved posts
  const newUniquePosts = uniquePosts.filter(p => !existingPosts.has(p.postId));
  console.log(`  New posts to save: ${newUniquePosts.length}`);

  // Save new posts
  for (const post of newUniquePosts) {
    savePost(post);
  }

  // Summary stats
  const finalPosts = [...existingPosts.values(), ...newUniquePosts];
  const bySource = {
    reddit_new: finalPosts.filter(p => p.source === 'reddit_new').length,
    reddit_top: finalPosts.filter(p => p.source === 'reddit_top').length,
    google: finalPosts.filter(p => p.source.startsWith('google')).length,
  };

  const totalComments = finalPosts.reduce((sum, p) => sum + p.numComments, 0);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Discovery Complete!\n');
  console.log(`📊 Total unique posts: ${finalPosts.length}`);
  console.log(`   - From reddit_new: ${bySource.reddit_new}`);
  console.log(`   - From reddit_top: ${bySource.reddit_top}`);
  console.log(`   - From google: ${bySource.google}`);
  console.log(`\n📝 Total comments to analyze: ~${totalComments.toLocaleString()}`);
  console.log(`💰 Estimated analysis cost: $${((totalComments * 0.65 * 200 / 1000000) * 0.25).toFixed(2)}`);
  console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);
  console.log('\nNext step: npm run scrape:tips');
}

main().catch(console.error);