import { createRedditClient } from './reddit-client.js';
import { config } from 'dotenv';
import { writeFileSync, existsSync, readFileSync } from 'fs';

config();

const reddit = await createRedditClient();

const INPUT_FILE = 'discovered_tip_posts.jsonl';
const OUTPUT_FILE = 'tip_posts_full.jsonl';

interface DiscoveredPost {
  postId: string;
  url: string;
  title: string;
  score: number;
  numComments: number;
  created: number;
  source: string;
}

interface Comment {
  id: string;
  text: string;
  score: number;
  author: string;
  depth: number;
  parentId: string | null;
  created: number;
}

interface FullPost {
  postId: string;
  url: string;
  title: string;
  body: string;
  score: number;
  author: string;
  created: number;
  numComments: number;
  comments: Comment[];
  scrapedAt: number;
}

/**
 * Load discovered posts
 */
function loadDiscoveredPosts(): DiscoveredPost[] {
  if (!existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.error('   Run "npm run discover:tips:v2" first');
    return [];
  }

  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(line => JSON.parse(line));
}

/**
 * Load already-scraped post IDs
 */
function loadScrapedPostIds(): Set<string> {
  const ids = new Set<string>();

  if (!existsSync(OUTPUT_FILE)) {
    return ids;
  }

  const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const post = JSON.parse(line);
      ids.add(post.postId);
    } catch (e) {
      // Skip
    }
  }

  return ids;
}

/**
 * Save a full post
 */
function saveFullPost(post: FullPost) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(post) + '\n', { flag: 'a' });
}

/**
 * Scrape a single post with all comments
 */
async function scrapePost(postId: string): Promise<FullPost | null> {
  try {
    const submission = await reddit.getSubmission(postId).fetch();

    // Expand all comments
    await submission.expandReplies({ limit: Infinity, depth: Infinity });

    // Extract comments recursively
    const comments: Comment[] = [];

    function extractComments(commentList: any[], depth: number = 0) {
      for (const comment of commentList) {
        // Skip deleted/removed
        if (!comment.body || comment.body === '[deleted]' || comment.body === '[removed]') {
          continue;
        }

        // Determine parent ID
        let parentId: string | null = null;
        if (comment.parent_id) {
          if (comment.parent_id.startsWith('t1_')) {
            parentId = comment.parent_id.replace('t1_', '');
          }
          // t3_ prefix means parent is the post itself
        }

        comments.push({
          id: comment.id,
          text: comment.body,
          score: comment.score,
          author: comment.author?.name || '[deleted]',
          depth,
          parentId,
          created: comment.created_utc,
        });

        // Recurse into replies
        if (comment.replies && comment.replies.length > 0) {
          extractComments(comment.replies, depth + 1);
        }
      }
    }

    extractComments(submission.comments);

    return {
      postId: submission.id,
      url: `https://reddit.com${submission.permalink}`,
      title: submission.title,
      body: submission.selftext || '',
      score: submission.score,
      author: submission.author?.name || '[deleted]',
      created: submission.created_utc,
      numComments: submission.num_comments,
      comments,
      scrapedAt: Date.now(),
    };
  } catch (error: any) {
    console.error(`    ✗ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('📥 Scraping Full Post Content + Comments\n');
  console.log('='.repeat(50));

  // Load discovered posts
  const discoveredPosts = loadDiscoveredPosts();
  if (discoveredPosts.length === 0) {
    return;
  }

  console.log(`\n📂 Found ${discoveredPosts.length} discovered posts`);

  // Filter out already-scraped
  const scrapedIds = loadScrapedPostIds();
  const toScrape = discoveredPosts.filter(p => !scrapedIds.has(p.postId));

  console.log(`   Already scraped: ${scrapedIds.size}`);
  console.log(`   To scrape: ${toScrape.length}\n`);

  if (toScrape.length === 0) {
    console.log('✅ All posts already scraped!');
    return;
  }

  // Sort by score descending (scrape best posts first)
  toScrape.sort((a, b) => b.score - a.score);

  let scraped = 0;
  let totalComments = 0;
  const startTime = Date.now();

  for (const post of toScrape) {
    scraped++;
    const progress = `[${scraped}/${toScrape.length}]`;

    console.log(`${progress} Scraping: "${post.title.slice(0, 50)}..." (${post.score} pts)`);

    const fullPost = await scrapePost(post.postId);

    if (fullPost) {
      saveFullPost(fullPost);
      totalComments += fullPost.comments.length;
      console.log(`    ✓ ${fullPost.comments.length} comments`);
    }

    // Progress update every 20 posts
    if (scraped % 20 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = scraped / elapsed;
      const remaining = toScrape.length - scraped;
      const eta = Math.round(remaining / rate);

      console.log(`\n  --- Progress: ${scraped}/${toScrape.length} (${Math.round(100 * scraped / toScrape.length)}%)`);
      console.log(`  --- Comments so far: ${totalComments.toLocaleString()}`);
      console.log(`  --- ETA: ${Math.floor(eta / 60)}m ${eta % 60}s\n`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 1000));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Scraping Complete!\n');
  console.log(`📊 Posts scraped: ${scraped}`);
  console.log(`📝 Total comments: ${totalComments.toLocaleString()}`);
  console.log(`⏱️  Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);
  console.log('\nNext step: npm run analyze:tips');
}

main().catch(console.error);