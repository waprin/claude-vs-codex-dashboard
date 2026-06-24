import Anthropic from '@anthropic-ai/sdk';
import { config } from 'dotenv';
import { writeFileSync, existsSync, readFileSync } from 'fs';

config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const INPUT_FILE = 'tip_posts_full.jsonl';
const OUTPUT_FILE = 'extracted_tips.jsonl';
const MODEL = 'claude-3-5-haiku-20241022';

interface Comment {
  id: string;
  text: string;
  score: number;
  author: string;
  depth: number;
  parentId: string | null;
}

interface FullPost {
  postId: string;
  url: string;
  title: string;
  body: string;
  score: number;
  author: string;
  comments: Comment[];
}

interface ExtractedTip {
  tip: string;
  category: string;
  advanced: boolean;
  sourcePostId: string;
  sourcePostTitle: string;
  sourcePostUrl: string;
  sourcePostScore: number;
  sourceCommentId: string | null;
  sourceCommentScore: number | null;
  extractedAt: number;
}

/**
 * Load scraped posts
 */
function loadPosts(): FullPost[] {
  if (!existsSync(INPUT_FILE)) {
    console.error(`❌ Input file not found: ${INPUT_FILE}`);
    console.error('   Run "npm run scrape:tips" first');
    return [];
  }

  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(line => JSON.parse(line));
}

/**
 * Load already-analyzed post IDs
 */
function loadAnalyzedPostIds(): Set<string> {
  const ids = new Set<string>();

  if (!existsSync(OUTPUT_FILE)) {
    return ids;
  }

  const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const tip = JSON.parse(line);
      ids.add(tip.sourcePostId);
    } catch (e) {
      // Skip
    }
  }

  return ids;
}

/**
 * Save extracted tips
 */
function saveTips(tips: ExtractedTip[]) {
  for (const tip of tips) {
    writeFileSync(OUTPUT_FILE, JSON.stringify(tip) + '\n', { flag: 'a' });
  }
}

/**
 * Build prompt for tip extraction
 */
function buildPrompt(post: FullPost): string {
  // Build comment text, sorted by score
  const topComments = post.comments
    .sort((a, b) => b.score - a.score)
    .slice(0, 30) // Limit to top 30 comments to manage token usage
    .map(c => `[${c.score} pts] ${c.text}`)
    .join('\n\n---\n\n');

  return `Analyze this Reddit post from r/ClaudeCode and extract any Claude Code tips, tricks, or useful techniques.

POST TITLE: ${post.title}
POST SCORE: ${post.score} upvotes
POST URL: ${post.url}

POST BODY:
${post.body || '[No body text]'}

---

TOP COMMENTS (sorted by upvotes):

${topComments || '[No comments]'}

---

INSTRUCTIONS:
Extract specific, actionable Claude Code tips from this thread. For each tip:

1. "tip": State the tip clearly and concisely (1-2 sentences max)
2. "category": One of: workflow, configuration, prompting, feature, debugging, performance, integration, or other
3. "advanced": true if non-obvious/not in official docs, false if basic
4. "commentScore": The score of the comment this tip came from (or null if from post body)

Focus on:
- Specific techniques, settings, or workflows
- Non-obvious features or behaviors
- Concrete advice that someone could act on

Skip:
- Vague opinions ("Claude is great")
- Bug reports without workarounds
- Questions without answers
- Off-topic discussion

Return JSON array: [{"tip": "...", "category": "...", "advanced": true/false, "commentScore": N}, ...]

If no actionable tips, return: []`;
}

/**
 * Extract tips from a single post using Claude
 */
async function extractTipsFromPost(post: FullPost): Promise<ExtractedTip[]> {
  const prompt = buildPrompt(post);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return [];

    // Parse JSON from response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const rawTips = JSON.parse(jsonMatch[0]);

    // Convert to our format
    return rawTips.map((t: any) => ({
      tip: t.tip,
      category: t.category || 'other',
      advanced: t.advanced ?? false,
      sourcePostId: post.postId,
      sourcePostTitle: post.title,
      sourcePostUrl: post.url,
      sourcePostScore: post.score,
      sourceCommentId: null, // Could enhance to track specific comment
      sourceCommentScore: t.commentScore ?? null,
      extractedAt: Date.now(),
    }));
  } catch (error: any) {
    console.error(`    ✗ Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('🔍 Extracting Tips from Posts\n');
  console.log('='.repeat(50));

  // Load posts
  const posts = loadPosts();
  if (posts.length === 0) return;

  console.log(`\n📂 Found ${posts.length} scraped posts`);

  // Filter already-analyzed
  const analyzedIds = loadAnalyzedPostIds();
  const toAnalyze = posts.filter(p => !analyzedIds.has(p.postId));

  console.log(`   Already analyzed: ${analyzedIds.size}`);
  console.log(`   To analyze: ${toAnalyze.length}\n`);

  if (toAnalyze.length === 0) {
    console.log('✅ All posts already analyzed!');
    return;
  }

  // Sort by score (best posts first)
  toAnalyze.sort((a, b) => b.score - a.score);

  let analyzed = 0;
  let totalTips = 0;
  let advancedTips = 0;
  const startTime = Date.now();

  for (const post of toAnalyze) {
    analyzed++;
    const progress = `[${analyzed}/${toAnalyze.length}]`;

    console.log(`${progress} Analyzing: "${post.title.slice(0, 45)}..." (${post.score} pts)`);

    const tips = await extractTipsFromPost(post);

    if (tips.length > 0) {
      saveTips(tips);
      const advanced = tips.filter(t => t.advanced).length;
      totalTips += tips.length;
      advancedTips += advanced;
      console.log(`    ✓ ${tips.length} tips (${advanced} advanced)`);
    } else {
      console.log(`    - No tips found`);
    }

    // Progress update every 25 posts
    if (analyzed % 25 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = analyzed / elapsed;
      const remaining = toAnalyze.length - analyzed;
      const eta = Math.round(remaining / rate);

      console.log(`\n  --- Progress: ${analyzed}/${toAnalyze.length} (${Math.round(100 * analyzed / toAnalyze.length)}%)`);
      console.log(`  --- Tips so far: ${totalTips} (${advancedTips} advanced)`);
      console.log(`  --- ETA: ${Math.floor(eta / 60)}m ${eta % 60}s\n`);
    }

    // Small delay between API calls
    await new Promise(r => setTimeout(r, 200));
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Analysis Complete!\n');
  console.log(`📊 Posts analyzed: ${analyzed}`);
  console.log(`💡 Total tips extracted: ${totalTips}`);
  console.log(`⭐ Advanced tips: ${advancedTips}`);
  console.log(`⏱️  Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log(`\n📁 Saved to: ${OUTPUT_FILE}`);

  // Show top tips preview
  if (existsSync(OUTPUT_FILE)) {
    const allTips = readFileSync(OUTPUT_FILE, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l) as ExtractedTip);

    const topAdvanced = allTips
      .filter(t => t.advanced)
      .sort((a, b) => b.sourcePostScore - a.sourcePostScore)
      .slice(0, 10);

    if (topAdvanced.length > 0) {
      console.log('\n🏆 Top 10 Advanced Tips:\n');
      topAdvanced.forEach((tip, i) => {
        console.log(`${i + 1}. [${tip.category.toUpperCase()}] ${tip.tip}`);
        console.log(`   Source: ${tip.sourcePostScore} pts - "${tip.sourcePostTitle.slice(0, 50)}..."\n`);
      });
    }
  }
}

main().catch(console.error);