import Snoowrap from 'snoowrap';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const reddit = new Snoowrap({
  userAgent: process.env.REDDIT_USER_AGENT || 'lois-content-research/1.0.0',
  clientId: process.env.REDDIT_CLIENT_ID!,
  clientSecret: process.env.REDDIT_CLIENT_SECRET!,
  username: process.env.REDDIT_USERNAME!,
  password: process.env.REDDIT_PASSWORD!,
});

// Coding-focused subreddits for Claude Code vs Codex analysis
const SUBREDDITS = ['ClaudeCode', 'codex', 'ChatGPTCoding'];

// Time range: 2.5 months back
const MONTHS_BACK = 2.5;

// Keywords to filter for (must contain ALL of these in post title/selftext)
const REQUIRED_KEYWORDS = ['claude code', 'codex'];

// Output file
const DISCOVERED_URLS_FILE = 'discovered_urls.jsonl';

interface DiscoveredURL {
  url: string;
  title: string;
  snippet: string;
  discoveredAt: number;
  query: string;
  subreddit: string;
  score: number;
  created: number;
}

/**
 * Load previously discovered URLs to avoid duplicates
 */
function loadDiscoveredURLs(): Set<string> {
  if (!existsSync(DISCOVERED_URLS_FILE)) {
    return new Set();
  }

  const lines = readFileSync(DISCOVERED_URLS_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const urls = new Set<string>();

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      urls.add(record.url);
    } catch (e) {
      // Skip malformed lines
    }
  }

  return urls;
}

/**
 * Save discovered URL to JSONL file
 */
function saveDiscoveredURL(record: DiscoveredURL) {
  const line = JSON.stringify(record) + '\n';
  writeFileSync(DISCOVERED_URLS_FILE, line, { flag: 'a' });
}

/**
 * Check if text contains all required keywords
 */
function matchesKeywords(text: string): boolean {
  const normalized = text.toLowerCase();
  return REQUIRED_KEYWORDS.every(keyword => normalized.includes(keyword));
}

/**
 * Discover posts from a single subreddit
 */
async function discoverFromSubreddit(subredditName: string): Promise<DiscoveredURL[]> {
  console.log(`\n📡 Fetching posts from r/${subredditName}...`);

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - MONTHS_BACK);
  const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);

  const existingUrls = loadDiscoveredURLs();
  const discovered: DiscoveredURL[] = [];

  const subreddit = reddit.getSubreddit(subredditName);

  // Fetch posts in batches
  let after: string | undefined = undefined;
  let totalFetched = 0;
  let totalMatched = 0;
  let reachedCutoff = false;

  while (!reachedCutoff) {
    try {
      // Fetch batch of 100 posts
      const listing = await subreddit.getNew({ limit: 100, after });

      if (listing.length === 0) {
        console.log(`  ✓ Reached end of subreddit`);
        break;
      }

      totalFetched += listing.length;

      for (const post of listing) {
        // Check if we've gone past our time window
        if (post.created_utc < cutoffTimestamp) {
          reachedCutoff = true;
          break;
        }

        const permalink = `https://reddit.com${post.permalink}`;

        // Skip if already discovered
        if (existingUrls.has(permalink)) {
          continue;
        }

        // Check if post matches our keywords
        const searchText = `${post.title} ${post.selftext || ''}`;
        if (!matchesKeywords(searchText)) {
          continue;
        }

        // Found a match!
        const record: DiscoveredURL = {
          url: permalink,
          title: post.title,
          snippet: post.selftext ? post.selftext.slice(0, 200) : '',
          discoveredAt: Date.now(),
          query: 'reddit_api',
          subreddit: subredditName,
          score: post.score,
          created: post.created_utc,
        };

        discovered.push(record);
        existingUrls.add(permalink);
        saveDiscoveredURL(record);
        totalMatched++;

        console.log(`  ✓ ${post.title} (${post.score} ↑)`);
      }

      // Set pagination token for next batch
      if (listing.length > 0) {
        after = listing[listing.length - 1].name;
      }

      console.log(`  Progress: ${totalFetched} fetched, ${totalMatched} matched`);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error(`  ✗ Error fetching from r/${subredditName}: ${error.message}`);
      break;
    }
  }

  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
  console.log(`  ✓ Complete: ${totalFetched} posts scanned (back to ${cutoffDateStr})`);
  console.log(`  ✓ Found: ${totalMatched} matching posts`);

  return discovered;
}

async function main() {
  console.log('🔍 Reddit Discovery: Finding Claude Code vs Codex discussions\n');
  console.log(`Subreddits: ${SUBREDDITS.join(', ')}`);
  console.log(`Time range: Last ${MONTHS_BACK} months`);
  console.log(`Keywords: Posts must contain ALL of: ${REQUIRED_KEYWORDS.join(', ')}\n`);

  const startTime = Date.now();
  let totalDiscovered = 0;

  for (const subreddit of SUBREDDITS) {
    const discovered = await discoverFromSubreddit(subreddit);
    totalDiscovered += discovered.length;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  console.log(`\n✓ Discovery complete!`);
  console.log(`  Time: ${minutes}m ${seconds}s`);
  console.log(`  Found: ${totalDiscovered} new matching posts`);
  console.log(`  Saved to: ${DISCOVERED_URLS_FILE}`);
  console.log(`\nNext step: Run "npm run scrape" to fetch full post data + comments`);
}

main().catch(console.error);
