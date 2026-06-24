import { writeFileSync, readFileSync, existsSync } from 'fs';

// Output file
const DISCOVERED_URLS_FILE = 'discovered_blog_urls.jsonl';

interface BlogSource {
  name: string;
  url: string;
  type: 'anthropic' | 'openai' | 'generic';
}

interface DiscoveredBlogPost {
  url: string;
  title: string;
  snippet: string;
  discoveredAt: number;
  source: string;
  publishedDate?: string;
}

// Blog sources to scrape
const BLOG_SOURCES: BlogSource[] = [
  {
    name: 'Anthropic Engineering',
    url: 'https://www.anthropic.com/engineering',
    type: 'anthropic'
  }
  // Add more blogs here:
  // { name: 'OpenAI Blog', url: 'https://openai.com/blog', type: 'openai' },
  // { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/', type: 'generic' },
];

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
function saveDiscoveredURL(record: DiscoveredBlogPost) {
  const line = JSON.stringify(record) + '\n';
  writeFileSync(DISCOVERED_URLS_FILE, line, { flag: 'a' });
}

/**
 * Discover blog posts from Anthropic engineering blog
 * Uses simple regex parsing to extract article links and dates from the HTML
 */
async function discoverAnthropicBlog(source: BlogSource): Promise<DiscoveredBlogPost[]> {
  console.log(`\n📡 Fetching posts from ${source.name}...`);

  const existingUrls = loadDiscoveredURLs();
  const discovered: DiscoveredBlogPost[] = [];

  try {
    const response = await fetch(source.url);
    const html = await response.text();

    // Extract article cards from the HTML - each card contains URL, title, and date
    // Pattern: <article class="ArticleList_article..."><a href="/engineering/slug">...
    const articleCardPattern = /<article class="ArticleList_article[^"]*">[\s\S]*?<a[^>]*href="(\/engineering\/[^"]+)"[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?(?:<div class="[^"]*ArticleList_date[^"]*">([^<]+)<\/div>)?[\s\S]*?<\/a>/g;
    const matches = [...html.matchAll(articleCardPattern)];

    console.log(`  Found ${matches.length} article URLs`);

    // For each match, extract URL, title, and date
    for (const match of matches) {
      const relativeUrl = match[1];
      const title = match[2].trim();
      const publishedDate = match[3] ? match[3].trim() : undefined;

      // Skip the index page itself
      if (relativeUrl === '/engineering' || relativeUrl === '/engineering/') {
        continue;
      }

      const fullUrl = `https://www.anthropic.com${relativeUrl}`;

      // Skip if already discovered
      if (existingUrls.has(fullUrl)) {
        continue;
      }

      const record: DiscoveredBlogPost = {
        url: fullUrl,
        title: title || 'Unknown Title',
        snippet: '', // Will be filled when we scrape the full content
        discoveredAt: Date.now(),
        source: source.name,
        publishedDate,
      };

      discovered.push(record);
      existingUrls.add(fullUrl);
      saveDiscoveredURL(record);

      console.log(`  ✓ ${title}${publishedDate ? ` (${publishedDate})` : ''}`);
    }

  } catch (error: any) {
    console.error(`  ✗ Error fetching ${source.name}: ${error.message}`);
  }

  console.log(`  ✓ Found: ${discovered.length} new posts`);
  return discovered;
}

/**
 * Main discovery function - coordinates discovery from all blog sources
 */
async function main() {
  console.log('🔍 Blog Discovery: Finding AI engineering blog posts\n');
  console.log(`Sources: ${BLOG_SOURCES.map(s => s.name).join(', ')}\n`);

  const startTime = Date.now();
  let totalDiscovered = 0;

  for (const source of BLOG_SOURCES) {
    let discovered: DiscoveredBlogPost[] = [];

    switch (source.type) {
      case 'anthropic':
        discovered = await discoverAnthropicBlog(source);
        break;
      // Add more blog types here as needed
      default:
        console.log(`  ⚠ Unknown blog type: ${source.type}`);
    }

    totalDiscovered += discovered.length;
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n✓ Discovery complete!`);
  console.log(`  Time: ${duration}s`);
  console.log(`  Found: ${totalDiscovered} new blog posts`);
  console.log(`  Saved to: ${DISCOVERED_URLS_FILE}`);
  console.log(`\nNext step: Run "npm run scrape:blogs" to fetch full post content`);
}

main().catch(console.error);
