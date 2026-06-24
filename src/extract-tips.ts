import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';
import Snoowrap from 'snoowrap';

config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const reddit = new Snoowrap({
  userAgent: process.env.REDDIT_USER_AGENT || 'lois-content-research/1.0.0',
  clientId: process.env.REDDIT_CLIENT_ID!,
  clientSecret: process.env.REDDIT_CLIENT_SECRET!,
  username: process.env.REDDIT_USERNAME!,
  password: process.env.REDDIT_PASSWORD!,
});

const INPUT_FILE = 'claude_code_tips.jsonl';
const OUTPUT_FILE = 'extracted_tips.jsonl';

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

interface ExtractedTip {
  postId: string;
  postTitle: string;
  postScore: number;
  postUrl: string;
  tips: Array<{
    tip: string;
    category: string; // workflow, feature, performance, debugging, etc.
    advanced: boolean; // is this non-obvious/advanced?
    explanation?: string;
  }>;
  topComment?: string; // Most upvoted comment if relevant
  extractedAt: number;
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
 * Fetch top comment from Reddit post
 */
async function fetchTopComment(postId: string): Promise<string | null> {
  try {
    const submission = await reddit.getSubmission(postId).fetch();
    await submission.expandReplies({ limit: 1, depth: 0 });

    if (submission.comments && submission.comments.length > 0) {
      const topComment = submission.comments
        .filter((c: any) => c.body && c.body !== '[deleted]' && c.body !== '[removed]')
        .sort((a: any, b: any) => b.score - a.score)[0];

      if (topComment) {
        return topComment.body;
      }
    }
  } catch (error) {
    console.error(`Error fetching comments for ${postId}: ${error}`);
  }
  return null;
}

/**
 * Extract tips using Claude
 */
async function extractTips(post: TipPost, topComment: string | null): Promise<ExtractedTip | null> {
  const prompt = `Analyze this Reddit post from r/ClaudeCode and extract any Claude Code tips or tricks mentioned.

POST TITLE: ${post.title}
POST SCORE: ${post.score} upvotes

POST CONTENT:
${post.selftext || '[No content - title only post]'}

${topComment ? `TOP COMMENT:\n${topComment}` : ''}

---

Extract any Claude Code tips, tricks, or useful information from this post. For each tip:
1. State the tip clearly and concisely
2. Categorize it (workflow, feature, performance, debugging, configuration, prompt-engineering, etc.)
3. Mark whether it's advanced/non-obvious (true) or basic/well-documented (false)
4. Add a brief explanation if the tip needs context

Focus on:
- Non-obvious features or workflows
- Performance optimization techniques
- Debugging strategies
- Prompt engineering tips specific to Claude Code
- Configuration tricks
- Workflow improvements
- Integration tips
- Workarounds for common issues

Skip:
- Basic features that are well-documented
- Generic AI coding advice that isn't Claude Code specific
- Bug reports without solutions
- Feature requests
- Rants or complaints

Return as JSON: { "tips": [{"tip": "...", "category": "...", "advanced": true/false, "explanation": "..."}] }

If there are no valuable tips in this post, return: { "tips": [] }`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        if (result.tips && result.tips.length > 0) {
          return {
            postId: post.id,
            postTitle: post.title,
            postScore: post.score,
            postUrl: post.permalink,
            tips: result.tips,
            topComment: topComment,
            extractedAt: Date.now()
          };
        }
      }
    }
  } catch (error) {
    console.error(`Error extracting tips from post ${post.id}: ${error}`);
  }

  return null;
}

/**
 * Save extracted tips
 */
function saveExtractedTip(tip: ExtractedTip) {
  const line = JSON.stringify(tip) + '\n';
  writeFileSync(OUTPUT_FILE, line, { flag: 'a' });
}

async function main() {
  console.log('🔍 Extracting Claude Code Tips\n');

  // Load discovered posts
  const posts = loadTipPosts();

  // Sort by combined score (tip potential + engagement)
  posts.sort((a, b) => {
    const scoreA = a.potentialTipScore * 10 + a.score;
    const scoreB = b.potentialTipScore * 10 + b.score;
    return scoreB - scoreA;
  });

  // Take top 50 posts for analysis (to manage API costs)
  const topPosts = posts.slice(0, 50);
  console.log(`Analyzing top ${topPosts.length} posts out of ${posts.length} total\n`);

  const allExtractedTips: ExtractedTip[] = [];
  let processedCount = 0;
  let tipsFound = 0;

  for (const post of topPosts) {
    processedCount++;
    console.log(`[${processedCount}/${topPosts.length}] Processing: "${post.title}"`);

    // Fetch top comment if post has comments
    let topComment: string | null = null;
    if (post.numComments > 0) {
      console.log(`  Fetching top comment...`);
      topComment = await fetchTopComment(post.id);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
    }

    // Extract tips using Claude
    const extracted = await extractTips(post, topComment);

    if (extracted && extracted.tips.length > 0) {
      allExtractedTips.push(extracted);
      saveExtractedTip(extracted);

      const advancedCount = extracted.tips.filter(t => t.advanced).length;
      tipsFound += extracted.tips.length;
      console.log(`  ✓ Found ${extracted.tips.length} tips (${advancedCount} advanced)`);
    } else {
      console.log(`  - No actionable tips found`);
    }

    // Rate limiting for API calls
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✅ Extraction complete!');
  console.log(`Processed: ${processedCount} posts`);
  console.log(`Total tips found: ${tipsFound}`);
  console.log(`Posts with tips: ${allExtractedTips.length}`);
  console.log(`Saved to: ${OUTPUT_FILE}`);

  // Compile top advanced tips
  const allAdvancedTips = allExtractedTips
    .flatMap(post => post.tips
      .filter(tip => tip.advanced)
      .map(tip => ({
        ...tip,
        postTitle: post.postTitle,
        postScore: post.postScore,
        postUrl: post.postUrl
      }))
    )
    .sort((a, b) => b.postScore - a.postScore);

  if (allAdvancedTips.length > 0) {
    console.log('\n🏆 Top 10 Advanced Claude Code Tips:\n');
    allAdvancedTips.slice(0, 10).forEach((tip, i) => {
      console.log(`${i + 1}. [${tip.category.toUpperCase()}] ${tip.tip}`);
      if (tip.explanation) {
        console.log(`   ${tip.explanation}`);
      }
      console.log(`   Source: "${tip.postTitle}" (${tip.postScore} upvotes)`);
      console.log('');
    });
  }
}

main().catch(console.error);