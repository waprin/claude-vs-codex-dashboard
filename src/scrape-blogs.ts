import { writeFileSync, readFileSync, existsSync } from 'fs';

const DISCOVERED_URLS_FILE = 'discovered_blog_urls.jsonl';
const OUTPUT_FILE = 'blog_data.jsonl';

interface DiscoveredBlogPost {
  url: string;
  title: string;
  snippet: string;
  discoveredAt: number;
  source: string;
  publishedDate?: string;
}

interface BlogPost {
  url: string;
  source: string;
  title: string;
  content: string; // Full HTML content
  textContent: string; // Extracted text content (HTML tags stripped)
  publishedDate?: string;
  author?: string;
  tags?: string[];
  scrapedAt: number;
}

/**
 * Load discovered URLs from JSONL file
 */
function loadDiscoveredURLs(): DiscoveredBlogPost[] {
  if (!existsSync(DISCOVERED_URLS_FILE)) {
    console.error(`❌ No discovered URLs file found: ${DISCOVERED_URLS_FILE}`);
    console.error('   Run "npm run discover:blogs" first to discover blog posts');
    return [];
  }

  const lines = readFileSync(DISCOVERED_URLS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  return lines.map(line => JSON.parse(line));
}

/**
 * Simple HTML to text converter - strips tags and decodes entities
 */
function htmlToText(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/(div|p|h[1-6]|li|article|section)>/gi, '\n');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Collapse multiple whitespace
  text = text.replace(/\s+/g, ' ');

  // Collapse multiple newlines
  text = text.replace(/\n\s*\n/g, '\n\n');

  return text.trim();
}

/**
 * Extract main content from Anthropic blog post
 * Returns the article HTML and metadata
 */
function extractAnthropicContent(html: string, url: string): Partial<BlogPost> {
  // Extract title from <title> tag or <h1>
  const titleMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim().replace(/ \| Anthropic$/, '') : 'Unknown Title';

  // Try to extract the main article content
  // Anthropic blog typically wraps content in <article> or <main> tags
  let content = '';

  // Try to find article tag first
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    content = articleMatch[1];
  } else {
    // Fallback to main tag
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      content = mainMatch[1];
    } else {
      // Last resort: use everything in body
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      content = bodyMatch ? bodyMatch[1] : html;
    }
  }

  // Try to extract publish date
  // Pattern 1: HeroEngineering_date class with "Published <!-- -->MMM DD, YYYY"
  let publishedDate: string | undefined;
  const heroDateMatch = html.match(/HeroEngineering_date[^>]*>Published\s*(?:<!--[^>]*-->)?\s*([^<]+)</i);
  if (heroDateMatch) {
    publishedDate = heroDateMatch[1].trim();
  } else {
    // Pattern 2: time tag with datetime attribute
    const timeMatch = html.match(/<time[^>]*datetime="([^"]+)"/i);
    if (timeMatch) {
      publishedDate = timeMatch[1];
    } else {
      // Pattern 3: JSON-LD publishedTime
      const jsonMatch = html.match(/publishedTime":\s*"([^"]+)"/i);
      publishedDate = jsonMatch ? jsonMatch[1] : undefined;
    }
  }

  // Try to extract author
  const authorMatch = html.match(/"author":\s*{[^}]*"name":\s*"([^"]+)"/i) ||
                      html.match(/by\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
  const author = authorMatch ? authorMatch[1] : undefined;

  return {
    title,
    content,
    textContent: htmlToText(content),
    publishedDate,
    author,
  };
}

/**
 * Scrape a single blog post
 */
async function scrapeBlogPost(discovered: DiscoveredBlogPost): Promise<BlogPost | null> {
  try {
    console.log(`  Fetching: ${discovered.title}`);

    const response = await fetch(discovered.url);

    if (!response.ok) {
      console.error(`  ✗ HTTP ${response.status}: ${discovered.url}`);
      return null;
    }

    const html = await response.text();

    // Extract content based on source
    let extracted: Partial<BlogPost>;

    if (discovered.source.includes('Anthropic')) {
      extracted = extractAnthropicContent(html, discovered.url);
    } else {
      // Generic extraction for other blogs
      extracted = extractAnthropicContent(html, discovered.url);
    }

    const post: BlogPost = {
      url: discovered.url,
      source: discovered.source,
      title: extracted.title || discovered.title,
      content: extracted.content || '',
      textContent: extracted.textContent || '',
      // Use the publishedDate from discovery (from listing page) instead of extracting from blog post
      // Blog post pages may show dynamic dates, but the listing page has the correct dates
      publishedDate: discovered.publishedDate || extracted.publishedDate,
      author: extracted.author,
      tags: extracted.tags,
      scrapedAt: Date.now(),
    };

    const wordCount = post.textContent.split(/\s+/).length;
    console.log(`  ✓ ${post.title} (${wordCount} words)`);

    return post;
  } catch (error: any) {
    console.error(`  ✗ Error fetching ${discovered.url}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('📥 Starting blog scrape from discovered URLs...\n');

  const startTime = Date.now();

  // Load discovered URLs
  const discoveredURLs = loadDiscoveredURLs();

  if (discoveredURLs.length === 0) {
    console.log('No URLs to scrape. Exiting.');
    return;
  }

  console.log(`Found ${discoveredURLs.length} discovered URLs\n`);

  // Track which posts we've already scraped
  const scrapedUrls = new Set<string>();
  if (existsSync(OUTPUT_FILE)) {
    const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const post = JSON.parse(line);
        scrapedUrls.add(post.url);
      } catch (e) {
        // Skip malformed lines
      }
    }
    console.log(`Skipping ${scrapedUrls.size} already scraped posts\n`);
  }

  let scraped = 0;
  let skipped = 0;
  let errors = 0;
  let totalWords = 0;

  for (let i = 0; i < discoveredURLs.length; i++) {
    const discovered = discoveredURLs[i];

    if (scrapedUrls.has(discovered.url)) {
      console.log(`↩ Already scraped: ${discovered.title}`);
      skipped++;
      continue;
    }

    const post = await scrapeBlogPost(discovered);

    if (post) {
      // Append to JSONL file
      writeFileSync(OUTPUT_FILE, JSON.stringify(post) + '\n', { flag: 'a' });
      scrapedUrls.add(post.url);
      totalWords += post.textContent.split(/\s+/).length;
      scraped++;
    } else {
      errors++;
    }

    // Rate limiting (be nice to servers)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);

  console.log(`\n✓ Scraping complete!`);
  console.log(`  Time: ${totalTime}s`);
  console.log(`  Scraped: ${scraped} posts`);
  console.log(`  Skipped: ${skipped} posts`);
  console.log(`  Errors: ${errors} posts`);
  console.log(`  Total words: ${totalWords.toLocaleString()} (avg ${scraped > 0 ? Math.round(totalWords / scraped).toLocaleString() : 0} per post)`);
  console.log(`  Data saved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
