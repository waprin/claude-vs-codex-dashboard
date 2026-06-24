import Snoowrap from 'snoowrap';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const reddit = new Snoowrap({
  userAgent: process.env.REDDIT_USER_AGENT || 'lois-content-research/1.0.0',
  clientId: process.env.REDDIT_CLIENT_ID!,
  clientSecret: process.env.REDDIT_CLIENT_SECRET!,
  username: process.env.REDDIT_USERNAME!,
  password: process.env.REDDIT_PASSWORD!,
});

const INPUT_FILE = 'claude_code_tips.jsonl';
const OUTPUT_FILE = 'top_tips_content.jsonl';

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

interface FullPost {
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
  topComments: Array<{
    text: string;
    score: number;
    author: string;
  }>;
  fetchedAt: number;
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
 * Fetch full post with top comments
 */
async function fetchFullPost(post: TipPost): Promise<FullPost | null> {
  try {
    const submission = await reddit.getSubmission(post.id).fetch();
    await submission.expandReplies({ limit: 1, depth: 1 });

    // Get top 5 comments
    const topComments = submission.comments
      .filter((c: any) => c.body && c.body !== '[deleted]' && c.body !== '[removed]')
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((c: any) => ({
        text: c.body,
        score: c.score,
        author: c.author?.name || '[deleted]'
      }));

    return {
      ...post,
      selftext: submission.selftext || '',
      topComments,
      fetchedAt: Date.now()
    };
  } catch (error) {
    console.error(`Error fetching post ${post.id}: ${error}`);
    return null;
  }
}

/**
 * Save full post data
 */
function saveFullPost(post: FullPost) {
  const line = JSON.stringify(post) + '\n';
  writeFileSync(OUTPUT_FILE, line, { flag: 'a' });
}

async function main() {
  console.log('🔍 Fetching Top Claude Code Tip Posts\n');

  // Load discovered posts
  const posts = loadTipPosts();

  // Sort by combined score (tip potential + engagement)
  posts.sort((a, b) => {
    const scoreA = a.potentialTipScore * 10 + a.score;
    const scoreB = b.potentialTipScore * 10 + b.score;
    return scoreB - scoreA;
  });

  // Target posts with the highest potential
  const targetPosts = [
    'Claude Code is a Beast – Tips from 6 Months of Hardcore Use',
    '25 things I\'ve learned shipping A LOT features with Claude Code',
    'My 2 cents of making Claude Code create production ready code',
    'My experience: Building solid applications for production in Claude Code',
    'Sub Agents are a GAME CHANGER',
    'The `.claude/` directory is the key to supercharging dev workflows',
    'Claude Code is game changer with memory plugin',
    'I asked Claude Code to analyze our entire chat history',
    'Tips after using Claude Code daily',
    '4 Claude Code CLI tips I wish I knew earlier',
    'This Claude.md saves your tokens',
    'The feature-dev plugin leveled up my code',
    'I stopped vibe coding by giving Claude Code the context',
    'Collation of Claude Code Best Practices',
    'The new plan mode is not good',
    'One MCP to rule them all',
    'Modularization Hook',
    'A checklist that saves me from endless back-and-forth',
    'finally figured out why claude\'s UI generations look like ai slop'
  ];

  // Find matching posts
  const topPosts: TipPost[] = [];
  for (const target of targetPosts) {
    const found = posts.find(p => p.title.toLowerCase().includes(target.toLowerCase()));
    if (found) {
      topPosts.push(found);
    }
  }

  console.log(`Fetching ${topPosts.length} high-value posts...\n`);

  let fetchedCount = 0;
  for (const post of topPosts) {
    fetchedCount++;
    console.log(`[${fetchedCount}/${topPosts.length}] Fetching: "${post.title}"`);
    console.log(`  Score: ${post.score}, Comments: ${post.numComments}`);

    const fullPost = await fetchFullPost(post);
    if (fullPost) {
      saveFullPost(fullPost);
      console.log(`  ✓ Fetched successfully`);

      // Show preview if there's content
      if (fullPost.selftext) {
        const preview = fullPost.selftext.slice(0, 200);
        console.log(`  Preview: ${preview}...`);
      }
    } else {
      console.log(`  ✗ Failed to fetch`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n✅ Fetching complete!`);
  console.log(`Fetched: ${fetchedCount} posts`);
  console.log(`Saved to: ${OUTPUT_FILE}`);
  console.log('\nNext: Analyze these posts to extract the tips');
}

main().catch(console.error);