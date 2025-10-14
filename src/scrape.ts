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

// Research notes:
// "claude code" "codex" site:reddit.com
// https://www.reddit.com/r/LLMDevs/
// https://www.reddit.com/r/codex/comments/1nqvcr6/my_oneday_deep_dive_on_codex_vs_claude_code_vs/

// Relevant subreddits (for potential manual trawling via Reddit API):
// ['ClaudeAI', 'Cursor', 'ChatGPTCoding', 'Anthropic', 'OpenAI', 'LLMDevs',
//  'vibecoding', 'codex', 'mcp', 'AI_Agents', 'OpenaiCodex', 'VibeCodeDevs']

const DISCOVERED_URLS_FILE = 'discovered_urls.jsonl';
const OUTPUT_FILE = 'reddit_data.jsonl';

interface RedditPost {
  postId: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  url: string;
  permalink: string;
  author: string;
  created: number;
  numComments: number;
  comments: Array<{
    id: string;
    parentId: string | null;  // null = top-level, otherwise parent comment ID
    postId: string;            // which post this comment belongs to
    depth: number;             // 0 = top-level, 1 = reply, 2 = reply to reply, etc.
    text: string;
    score: number;
    author: string;
    created: number;
  }>;
}

interface DiscoveredURL {
  url: string;
  title: string;
  snippet: string;
  discoveredAt: number;
  query: string;
}

/**
 * Extract post ID from Reddit URL
 */
function extractPostId(url: string): string | null {
  const match = url.match(/comments\/(\w+)/);
  return match ? match[1] : null;
}

/**
 * Load discovered URLs from JSONL file
 */
function loadDiscoveredURLs(): DiscoveredURL[] {
  if (!existsSync(DISCOVERED_URLS_FILE)) {
    console.error(`❌ No discovered URLs file found: ${DISCOVERED_URLS_FILE}`);
    console.error('   Run "npm run discover" first to discover threads');
    return [];
  }

  const lines = readFileSync(DISCOVERED_URLS_FILE, 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  return lines.map(line => JSON.parse(line));
}

/**
 * Scrape a single Reddit post with full comment tree
 * Returns: [post data, API calls made]
 */
async function scrapePost(url: string): Promise<[RedditPost | null, number]> {
  const postId = extractPostId(url);
  if (!postId) {
    console.error(`  ✗ Invalid URL: ${url}`);
    return [null, 0];
  }

  try {
    let apiCalls = 0;

    // API call 1: fetch submission
    const submission = await reddit.getSubmission(postId).fetch();
    apiCalls++;

    console.log(`  ✓ ${submission.title} (${submission.score} ↑, ${submission.num_comments} comments)`);

    // Fetch all comments (expanding "load more" links)
    // Note: This may make additional API calls for "more comments" objects
    await submission.expandReplies({ limit: Infinity, depth: Infinity });

    // Estimate additional API calls for comment expansion
    // Reddit returns ~100 comments per request, so estimate calls needed
    const estimatedCommentCalls = Math.ceil(submission.num_comments / 100);
    apiCalls += estimatedCommentCalls;

    // Flatten comment tree and extract data with full context
    const allComments = submission.comments;
    const commentsList: RedditPost['comments'] = [];

    function extractComments(comments: any[], depth: number = 0) {
      for (const comment of comments) {
        if (!comment.body || comment.body === '[deleted]' || comment.body === '[removed]') {
          continue;
        }

        // Extract parent ID from parent_id field
        // Format is "t1_xxxxx" for comments or "t3_xxxxx" for posts
        let parentId: string | null = null;
        if (comment.parent_id) {
          const match = comment.parent_id.match(/t[13]_(.+)/);
          if (match) {
            // If parent is t3_ (post), this is top-level, so parentId = null
            // If parent is t1_ (comment), extract the comment ID
            if (comment.parent_id.startsWith('t1_')) {
              parentId = match[1];
            }
          }
        }

        commentsList.push({
          id: comment.id,
          parentId: parentId,
          postId: submission.id,
          depth: depth,
          text: comment.body,
          score: comment.score,
          author: comment.author?.name || '[deleted]',
          created: comment.created_utc,
        });

        // Recursively extract replies (increase depth)
        if (comment.replies && comment.replies.length > 0) {
          extractComments(comment.replies, depth + 1);
        }
      }
    }

    extractComments(allComments, 0);

    const post = {
      postId: submission.id,
      subreddit: submission.subreddit.display_name,
      title: submission.title,
      selftext: submission.selftext || '',
      score: submission.score,
      url: submission.url,
      permalink: `https://reddit.com${submission.permalink}`,
      author: submission.author?.name || '[deleted]',
      created: submission.created_utc,
      numComments: submission.num_comments,
      comments: commentsList, // All comments, no artificial limit
    };

    return [post, apiCalls];
  } catch (error: any) {
    console.error(`  ✗ Error fetching ${url}: ${error.message}`);
    return [null, 1]; // Still made at least 1 API call before error
  }
}

async function main() {
  console.log('📥 Starting Reddit scrape from discovered URLs...\n');

  const startTime = Date.now();

  // Load discovered URLs
  const discoveredURLs = loadDiscoveredURLs();

  if (discoveredURLs.length === 0) {
    console.log('No URLs to scrape. Exiting.');
    return;
  }

  console.log(`Found ${discoveredURLs.length} discovered URLs\n`);

  // Track which posts we've already scraped
  const scrapedPostIds = new Set<string>();
  if (existsSync(OUTPUT_FILE)) {
    const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const post = JSON.parse(line);
        scrapedPostIds.add(post.postId);
      } catch (e) {
        // Skip malformed lines
      }
    }
    console.log(`Skipping ${scrapedPostIds.size} already scraped posts\n`);
  }

  let scraped = 0;
  let skipped = 0;
  let errors = 0;
  let totalApiCalls = 0;
  let totalComments = 0;

  for (let i = 0; i < discoveredURLs.length; i++) {
    const discovered = discoveredURLs[i];
    const postId = extractPostId(discovered.url);

    if (!postId) {
      console.log(`⊗ Invalid URL: ${discovered.url}`);
      errors++;
      continue;
    }

    if (scrapedPostIds.has(postId)) {
      console.log(`↩ Already scraped: ${discovered.title}`);
      skipped++;
      continue;
    }

    const [post, apiCalls] = await scrapePost(discovered.url);
    totalApiCalls += apiCalls;

    if (post) {
      // Append to JSONL file
      writeFileSync(OUTPUT_FILE, JSON.stringify(post) + '\n', { flag: 'a' });
      scrapedPostIds.add(post.postId);
      totalComments += post.comments.length;
      scraped++;

      // Show progress every 10 posts
      if (scraped % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const avgTimePerPost = elapsed / scraped;
        const remaining = discoveredURLs.length - i - 1;
        const etaSeconds = Math.round(avgTimePerPost * remaining);
        const etaMin = Math.floor(etaSeconds / 60);
        const etaSec = etaSeconds % 60;

        console.log(`\n  Progress: ${scraped}/${discoveredURLs.length - scrapedPostIds.size} scraped`);
        console.log(`  API calls: ${totalApiCalls} (~${(totalApiCalls / scraped).toFixed(1)} per post)`);
        console.log(`  Comments: ${totalComments} (~${(totalComments / scraped).toFixed(0)} per post)`);
        console.log(`  ETA: ${etaMin}m ${etaSec}s\n`);
      }
    } else {
      skipped++;
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const minutes = Math.floor(totalTime / 60);
  const seconds = totalTime % 60;

  console.log(`\n✓ Scraping complete!`);
  console.log(`  Time: ${minutes}m ${seconds}s`);
  console.log(`  Scraped: ${scraped} posts`);
  console.log(`  Skipped: ${skipped} posts`);
  console.log(`  Errors: ${errors} posts`);
  console.log(`  Total API calls: ${totalApiCalls} (avg ${scraped > 0 ? (totalApiCalls / scraped).toFixed(1) : 0} per post)`);
  console.log(`  Total comments: ${totalComments} (avg ${scraped > 0 ? (totalComments / scraped).toFixed(0) : 0} per post)`);
  console.log(`  Data saved to: ${OUTPUT_FILE}`);
  console.log(`\n📊 Quota estimate: ${totalApiCalls}/60 per minute (${Math.ceil(totalApiCalls / 60)} minutes minimum runtime)`);
}

main().catch(console.error);
