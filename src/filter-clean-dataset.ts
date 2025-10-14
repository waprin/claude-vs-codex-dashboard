import { readFileSync, writeFileSync, existsSync } from 'fs';

/**
 * Filter dataset to only include posts discovered via Reddit API
 * (excludes mixed-in Google API results for clean methodology)
 */

const DISCOVERED_URLS_FILE = 'discovered_urls.jsonl';
const REDDIT_DATA_FILE = 'reddit_data.jsonl';
const OUTPUT_FILE = 'reddit_data_clean.jsonl';

interface DiscoveredURL {
  url: string;
  query: string;
}

interface RedditPost {
  postId: string;
  [key: string]: any;
}

function main() {
  console.log('🧹 Filtering dataset to Reddit API discoveries only...\n');

  // Check files exist
  if (!existsSync(DISCOVERED_URLS_FILE)) {
    console.error(`❌ ${DISCOVERED_URLS_FILE} not found`);
    process.exit(1);
  }

  if (!existsSync(REDDIT_DATA_FILE)) {
    console.error(`❌ ${REDDIT_DATA_FILE} not found`);
    process.exit(1);
  }

  // Load discovered URLs and extract Reddit API ones
  console.log(`Reading ${DISCOVERED_URLS_FILE}...`);
  const discoveredLines = readFileSync(DISCOVERED_URLS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  const redditDiscovered = new Set<string>();
  let googleCount = 0;

  for (const line of discoveredLines) {
    try {
      const record: DiscoveredURL = JSON.parse(line);
      if (record.query === 'reddit_api') {
        // Extract post ID from URL
        const match = record.url.match(/comments\/(\w+)/);
        if (match) {
          redditDiscovered.add(match[1]);
        }
      } else {
        googleCount++;
      }
    } catch (e) {
      // Skip malformed lines
    }
  }

  console.log(`  Reddit API discovered: ${redditDiscovered.size}`);
  console.log(`  Google API discovered: ${googleCount}`);
  console.log(`  Total: ${discoveredLines.length}\n`);

  // Load scraped data and filter
  console.log(`Reading ${REDDIT_DATA_FILE}...`);
  const scrapedLines = readFileSync(REDDIT_DATA_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  console.log(`  Total scraped posts: ${scrapedLines.length}\n`);

  // Filter to only Reddit-discovered posts
  let kept = 0;
  let filtered = 0;

  for (const line of scrapedLines) {
    try {
      const post: RedditPost = JSON.parse(line);

      if (redditDiscovered.has(post.postId)) {
        // Keep this post
        writeFileSync(OUTPUT_FILE, line + '\n', { flag: 'a' });
        kept++;
      } else {
        filtered++;
      }
    } catch (e) {
      console.error(`  ⚠️  Skipping malformed line`);
    }
  }

  console.log(`✓ Filtering complete!`);
  console.log(`  Kept: ${kept} posts (Reddit API discovered)`);
  console.log(`  Filtered: ${filtered} posts (Google API discovered)`);
  console.log(`  Saved to: ${OUTPUT_FILE}\n`);

  console.log(`📊 Clean dataset ready for v1 analysis!`);
}

main();
