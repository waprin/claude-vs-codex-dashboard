import { config } from 'dotenv';
import { writeFileSync, readFileSync, existsSync } from 'fs';

config();

const GOOGLE_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_KEY!;
const GOOGLE_CX = process.env.GOOGLE_CUSTOM_SEARCH_CX!;

// Keywords for discovery
const SEARCH_QUERIES = [
  '"claude code" codex site:reddit.com',
];

interface GoogleSearchResult {
  link: string;
  title: string;
  snippet: string;
}

interface DiscoveredURL {
  url: string;
  title: string;
  snippet: string;
  discoveredAt: number;
  query: string;
}

const DISCOVERED_URLS_FILE = 'discovered_urls.jsonl';

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
 * Extract Reddit post ID from URL
 */
function extractRedditPostId(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/\w+\/comments\/(\w+)/);
  return match ? match[1] : null;
}

/**
 * Fetch results from Google Custom Search API
 */
async function searchGoogle(query: string, startIndex: number = 1): Promise<{ results: GoogleSearchResult[], totalResults: number }> {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('cx', GOOGLE_CX);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('start', startIndex.toString());

  console.log(`  Fetching results ${startIndex}-${startIndex + 9}...`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  const totalResults = data.searchInformation?.totalResults
    ? parseInt(data.searchInformation.totalResults)
    : 0;

  if (!data.items) {
    return { results: [], totalResults };
  }

  const results = data.items.map((item: any) => ({
    link: item.link,
    title: item.title,
    snippet: item.snippet,
  }));

  return { results, totalResults };
}

/**
 * Discover Reddit threads using Google Custom Search
 */
async function discoverThreads(
  query: string,
  maxResults: number = 100
): Promise<DiscoveredURL[]> {
  console.log(`\nDiscovering threads for: ${query}`);

  const existingUrls = loadDiscoveredURLs();
  const discovered: DiscoveredURL[] = [];
  let startIndex = 1;
  let totalAvailable = 0;

  while (discovered.length < maxResults && startIndex <= 91) {
    const { results, totalResults } = await searchGoogle(query, startIndex);

    // Log total on first call
    if (startIndex === 1) {
      totalAvailable = totalResults;
      console.log(`  Google reports ${totalResults} total results available`);
      if (totalResults > 100) {
        console.log(`  ⚠️  Can only retrieve first 100 due to API limits`);
      }
    }

    if (results.length === 0) {
      console.log('  No more results');
      break;
    }

    for (const result of results) {
      // Only process Reddit URLs
      if (!result.link.includes('reddit.com')) continue;

      // Skip if already discovered
      if (existingUrls.has(result.link)) {
        console.log(`  ↩ Already seen: ${result.title}`);
        continue;
      }

      // Check if it's a valid post URL (not subreddit homepage, user page, etc.)
      const postId = extractRedditPostId(result.link);
      if (!postId) {
        console.log(`  ⊗ Skipping non-post URL: ${result.link}`);
        continue;
      }

      const record: DiscoveredURL = {
        url: result.link,
        title: result.title,
        snippet: result.snippet,
        discoveredAt: Date.now(),
        query: query,
      };

      discovered.push(record);
      existingUrls.add(result.link);
      saveDiscoveredURL(record);

      console.log(`  ✓ ${result.title}`);
    }

    startIndex += 10;

    // Rate limiting - Google allows ~100 queries per day on free tier
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Final summary
  if (discovered.length >= 100 && totalAvailable > 100) {
    console.log(`  ⚠️  Hit 100-result cap (${totalAvailable - 100}+ results unavailable)`);
    console.log(`  💡 Consider using time-based queries to get more results`);
  }

  return discovered;
}

async function main() {
  console.log('🔍 Starting thread discovery via Google Custom Search...\n');
  console.log(`API Key: ${GOOGLE_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`Search Engine ID: ${GOOGLE_CX ? '✓ Set' : '✗ Missing'}\n`);

  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    console.error('❌ Missing required environment variables:');
    console.error('   GOOGLE_CUSTOM_SEARCH_KEY');
    console.error('   GOOGLE_CUSTOM_SEARCH_CX');
    process.exit(1);
  }

  let totalDiscovered = 0;

  for (const query of SEARCH_QUERIES) {
    const discovered = await discoverThreads(query, 100);
    totalDiscovered += discovered.length;
    console.log(`  Found ${discovered.length} new threads\n`);
  }

  console.log(`\n✓ Discovery complete! Found ${totalDiscovered} new threads`);
  console.log(`  Saved to: ${DISCOVERED_URLS_FILE}`);
}

main().catch(console.error);
