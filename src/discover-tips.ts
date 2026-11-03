import { createRedditClient } from './reddit-client.js';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const reddit = await createRedditClient();

const OUTPUT_FILE = 'claude_code_tips.jsonl';

// Keywords that often indicate a tip/trick post
const TIP_KEYWORDS = [
  'tip', 'trick', 'psa', 'til', 'discovered', 'found out', 'pro tip',
  'helpful', 'useful', 'hack', 'workflow', 'productivity', 'guide',
  'how to', 'tutorial', 'solved', 'solution', 'workaround', 'feature',
  'didn\'t know', 'game changer', 'underrated', 'hidden', 'lesser known'
];

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
  flair?: string;
  fetchedFrom: string; // 'top_all', 'top_month', 'hot', etc.
  potentialTipScore: number; // How likely this is to contain a useful tip
}

/**
 * Calculate how likely a post is to contain a useful tip
 */
function calculateTipScore(post: any): number {
  let score = 0;
  const titleLower = post.title.toLowerCase();
  const bodyLower = (post.selftext || '').toLowerCase();
  const combinedText = titleLower + ' ' + bodyLower;

  // Check for tip keywords in title (weighted more heavily)
  for (const keyword of TIP_KEYWORDS) {
    if (titleLower.includes(keyword)) score += 3;
    if (bodyLower.includes(keyword)) score += 1;
  }

  // Bonus for high engagement
  if (post.score >= 50) score += 3;
  else if (post.score >= 20) score += 2;
  else if (post.score >= 10) score += 1;

  // Bonus for discussion (comments indicate value)
  if (post.num_comments >= 20) score += 2;
  else if (post.num_comments >= 10) score += 1;

  // Check for specific patterns
  if (/^(psa|til|tip|trick|guide)/i.test(post.title)) score += 3;
  if (/^\[tip\]/i.test(post.title)) score += 3;
  if (/you (can|should|might want to)/i.test(combinedText)) score += 1;
  if (/i (discovered|found|learned|realized)/i.test(combinedText)) score += 2;

  // Penalize certain types of posts
  if (/\?$/.test(post.title) && !titleLower.includes('did you know')) score -= 2; // Questions
  if (/bug|issue|problem|error|broken/i.test(titleLower)) score -= 1; // Bug reports
  if (/rant|frustrated|annoying/i.test(combinedText)) score -= 2; // Rants

  return Math.max(0, score);
}

/**
 * Load previously discovered posts to avoid duplicates
 */
function loadExistingPosts(): Set<string> {
  if (!existsSync(OUTPUT_FILE)) {
    return new Set();
  }

  const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const ids = new Set<string>();

  for (const line of lines) {
    try {
      const post = JSON.parse(line);
      ids.add(post.id);
    } catch (e) {
      // Skip malformed lines
    }
  }

  return ids;
}

/**
 * Save tip post to JSONL file
 */
function saveTipPost(post: TipPost) {
  const line = JSON.stringify(post) + '\n';
  writeFileSync(OUTPUT_FILE, line, { flag: 'a' });
}

/**
 * Fetch posts using different sorting methods
 */
async function fetchPosts(subreddit: any, method: string, timeFilter?: string, limit: number = 100): Promise<any[]> {
  try {
    switch (method) {
      case 'top':
        return await subreddit.getTop({ time: timeFilter || 'all', limit });
      case 'hot':
        return await subreddit.getHot({ limit });
      case 'new':
        return await subreddit.getNew({ limit });
      default:
        return [];
    }
  } catch (error: any) {
    console.error(`Error fetching ${method} posts: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('🔍 Discovering Claude Code Tips from r/ClaudeCode\n');

  const existingIds = loadExistingPosts();
  console.log(`Already have ${existingIds.size} posts in database\n`);

  const subreddit = reddit.getSubreddit('ClaudeCode');
  const allTips: TipPost[] = [];

  // Strategy: Fetch from multiple sources to get a good mix
  const fetchStrategies = [
    { method: 'top', timeFilter: 'all', limit: 100, description: 'Top posts of all time' },
    { method: 'top', timeFilter: 'month', limit: 50, description: 'Top posts this month' },
    { method: 'top', timeFilter: 'week', limit: 30, description: 'Top posts this week' },
    { method: 'hot', timeFilter: undefined, limit: 50, description: 'Currently hot posts' },
    { method: 'new', timeFilter: undefined, limit: 50, description: 'Recent posts' },
  ];

  for (const strategy of fetchStrategies) {
    console.log(`\n📡 Fetching: ${strategy.description}...`);

    const posts = await fetchPosts(
      subreddit,
      strategy.method,
      strategy.timeFilter,
      strategy.limit
    );

    console.log(`  Fetched ${posts.length} posts`);

    let newTips = 0;
    for (const post of posts) {
      // Skip if already processed
      if (existingIds.has(post.id)) continue;

      // Skip low-quality posts
      if (post.score < 3) continue;

      // Calculate tip potential
      const tipScore = calculateTipScore(post);

      // Skip if unlikely to be a tip
      if (tipScore < 3) continue;

      const tipPost: TipPost = {
        id: post.id,
        title: post.title,
        selftext: post.selftext || '',
        score: post.score,
        url: post.url,
        permalink: `https://reddit.com${post.permalink}`,
        author: post.author?.name || '[deleted]',
        created: post.created_utc,
        numComments: post.num_comments,
        flair: post.link_flair_text,
        fetchedFrom: `${strategy.method}_${strategy.timeFilter || 'current'}`,
        potentialTipScore: tipScore
      };

      allTips.push(tipPost);
      existingIds.add(post.id);
      saveTipPost(tipPost);
      newTips++;

      if (tipScore >= 7) {
        console.log(`  ⭐ High-value tip: "${post.title}" (score: ${post.score}, tip score: ${tipScore})`);
      }
    }

    console.log(`  Found ${newTips} new potential tips`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Now search for specific tip-related terms
  console.log('\n📡 Searching for specific tip keywords...');
  const searchTerms = ['tip', 'trick', 'PSA', 'guide', 'tutorial', 'discovered'];

  for (const term of searchTerms) {
    try {
      console.log(`  Searching for: "${term}"`);
      const searchResults = await subreddit.search({
        query: term,
        time: 'all',
        sort: 'relevance',
        limit: 25
      });

      let foundCount = 0;
      for (const post of searchResults) {
        if (existingIds.has(post.id)) continue;
        if (post.score < 5) continue;

        const tipScore = calculateTipScore(post);
        if (tipScore < 3) continue;

        const tipPost: TipPost = {
          id: post.id,
          title: post.title,
          selftext: post.selftext || '',
          score: post.score,
          url: post.url,
          permalink: `https://reddit.com${post.permalink}`,
          author: post.author?.name || '[deleted]',
          created: post.created_utc,
          numComments: post.num_comments,
          flair: post.link_flair_text,
          fetchedFrom: `search_${term}`,
          potentialTipScore: tipScore
        };

        allTips.push(tipPost);
        existingIds.add(post.id);
        saveTipPost(tipPost);
        foundCount++;
      }

      console.log(`    Found ${foundCount} new tips`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      console.error(`  Error searching for "${term}": ${error.message}`);
    }
  }

  // Sort all tips by potential value (combination of tip score and engagement)
  allTips.sort((a, b) => {
    const scoreA = a.potentialTipScore * 10 + a.score + a.numComments;
    const scoreB = b.potentialTipScore * 10 + b.score + b.numComments;
    return scoreB - scoreA;
  });

  console.log('\n✅ Discovery complete!');
  console.log(`Total potential tips found: ${allTips.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);

  if (allTips.length > 0) {
    console.log('\n🏆 Top 5 highest-potential tips:');
    allTips.slice(0, 5).forEach((tip, i) => {
      console.log(`${i + 1}. "${tip.title}" (score: ${tip.score}, tip score: ${tip.potentialTipScore})`);
    });
  }

  console.log('\nNext step: Run "npm run extract-tips" to analyze and extract the actual tips');
}

main().catch(console.error);