import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { config } from 'dotenv';

config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const INPUT_FILE = 'reddit_data_clean.jsonl';
const OUTPUT_FILE = 'sentiment_analysis.jsonl';
const DASHBOARD_OUTPUT_FILE = 'dashboard/public/sentiment_analysis.jsonl';
const LOGS_DIR = 'logs';
const RUN_LOG_FILE = 'logs/runs.jsonl';
const BATCH_SIZE = 500; // Analyze 50 comments at a time for v1 pilot

// Model to use - change this to test different models
const MODEL = process.env.ANALYSIS_MODEL || 'claude-3-5-haiku-20241022';
// Options: 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'

interface RedditComment {
  id: string;
  parentId: string | null;
  postId: string;
  depth: number;
  text: string;
  score: number;
  author: string;
  created: number;
}

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
  comments: RedditComment[];
}

interface ThreadContext {
  postTitle: string;
  postBody: string;
  commentChain: RedditComment[];
  fullText: string;
}

interface SentimentResult {
  commentId: string;
  postId: string;
  subreddit: string;
  permalink: string;
  comparison: 'codex_better' | 'claude_code_better' | 'equal' | 'neither' | 'off_topic'
    | 'claude_code_only_positive' | 'claude_code_only_negative'
    | 'codex_only_positive' | 'codex_only_negative';
  claudeCodeSentiment: 'positive' | 'negative' | 'neutral' | 'n/a';
  codexSentiment: 'positive' | 'negative' | 'neutral' | 'n/a';
  reasoning: string;
  themes: string[];
  quoteWorthy: boolean;
  quote?: string;
  score: number;
  model: string;
  analyzedAt: number;
}

/**
 * Build thread context for a comment
 */
function getThreadContext(
  comment: RedditComment,
  allComments: RedditComment[],
  post: RedditPost
): ThreadContext {
  // Build comment chain from root to this comment
  const chain: RedditComment[] = [];
  let current: RedditComment | undefined = comment;

  // Walk up parent chain
  while (current) {
    chain.unshift(current);
    if (!current.parentId) break;
    current = allComments.find(c => c.id === current!.parentId);
  }

  const fullText = [
    `POST TITLE: ${post.title}`,
    post.selftext ? `POST BODY: ${post.selftext}` : '',
    ...chain.map((c, i) => `COMMENT ${i + 1} (depth ${c.depth}, score ${c.score}): ${c.text}`)
  ].filter(Boolean).join('\n\n');

  return {
    postTitle: post.title,
    postBody: post.selftext,
    commentChain: chain,
    fullText,
  };
}

/**
 * Check if thread context mentions both tools
 */
function mentionsBothTools(text: string): boolean {
  const lower = text.toLowerCase();
  const hasClaude = lower.includes('claude code') || lower.includes('claude-code');
  const hasCodex = lower.includes('codex');
  return hasClaude && hasCodex;
}

/**
 * Analyze comment sentiment using Claude
 */
async function analyzeSentiment(
  context: ThreadContext,
  comment: RedditComment,
  post: RedditPost
): Promise<SentimentResult> {
  const prompt = `You are analyzing Reddit comments comparing Claude Code and Codex (AI coding tools).

${context.fullText}

---

Based on this discussion thread, analyze the LAST comment's sentiment toward Claude Code vs Codex:

1. **Comparison**: How does the comment compare the two tools?
   - "codex_better": Direct comparison where Codex is preferred over Claude Code
   - "claude_code_better": Direct comparison where Claude Code is preferred over Codex
   - "equal": Rates both tools equally
   - "neither": Discusses neither tool favorably
   - "off_topic": Not actually comparing the tools (e.g., discussing other tools like GLM, Cursor, etc.)
   - "claude_code_only_positive": Only discusses Claude Code with positive sentiment
   - "claude_code_only_negative": Only discusses Claude Code with negative sentiment
   - "codex_only_positive": Only discusses Codex with positive sentiment
   - "codex_only_negative": Only discusses Codex with negative sentiment

2. **Claude Code Sentiment**: positive, negative, neutral, or n/a (if not discussed)
3. **Codex Sentiment**: positive, negative, neutral, or n/a (if not discussed)
4. **Reasoning**: Brief explanation (1-2 sentences)
5. **Themes**: What specific aspects are discussed? (e.g., "speed", "accuracy", "UI", "pricing", "bugs")
6. **Quote-worthy**: Is this a substantive, quotable comparison? (true/false)
7. **Quote**: If quote-worthy, extract the most relevant 1-2 sentence quote

Respond in JSON format:
{
  "comparison": "codex_better" | "claude_code_better" | "equal" | "neither" | "off_topic" | "claude_code_only_positive" | "claude_code_only_negative" | "codex_only_positive" | "codex_only_negative",
  "claudeCodeSentiment": "positive" | "negative" | "neutral" | "n/a",
  "codexSentiment": "positive" | "negative" | "neutral" | "n/a",
  "reasoning": "...",
  "themes": ["...", "..."],
  "quoteWorthy": true | false,
  "quote": "..." (optional)
}`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';

  // Extract JSON from response - handle various formats
  let jsonText = responseText.trim();

  // Remove markdown code blocks
  if (jsonText.includes('```')) {
    const match = jsonText.match(/```(?:json)?\s*\n?(.*?)\n?```/s);
    if (match) {
      jsonText = match[1].trim();
    }
  }

  // Find JSON object (look for first { and last })
  const firstBrace = jsonText.indexOf('{');
  const lastBrace = jsonText.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonText = jsonText.substring(firstBrace, lastBrace + 1);
  }

  const analysis = JSON.parse(jsonText);

  return {
    commentId: comment.id,
    postId: post.postId,
    subreddit: post.subreddit,
    permalink: `${post.permalink}${comment.id}`,
    comparison: analysis.comparison,
    claudeCodeSentiment: analysis.claudeCodeSentiment,
    codexSentiment: analysis.codexSentiment,
    reasoning: analysis.reasoning,
    themes: analysis.themes || [],
    quoteWorthy: analysis.quoteWorthy || false,
    quote: analysis.quote,
    score: comment.score,
    model: MODEL,
    analyzedAt: Date.now(),
  };
}

/**
 * Load already analyzed comment IDs
 */
function loadAnalyzedComments(): Set<string> {
  if (!existsSync(OUTPUT_FILE)) {
    return new Set();
  }

  const lines = readFileSync(OUTPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const ids = new Set<string>();

  for (const line of lines) {
    try {
      const result = JSON.parse(line);
      ids.add(result.commentId);
    } catch (e) {
      // Skip malformed lines
    }
  }

  return ids;
}

/**
 * Save sentiment result
 */
function saveSentiment(result: SentimentResult) {
  writeFileSync(OUTPUT_FILE, JSON.stringify(result) + '\n', { flag: 'a' });
}

/**
 * Log run metadata
 */
interface RunLog {
  timestamp: number;
  model: string;
  totalCandidates: number;
  alreadyAnalyzed: number;
  analyzedThisRun: number;
  errors: number;
  timeSeconds: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  batchSize: number;
}

function logRun(logData: RunLog) {
  // Ensure logs directory exists
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }

  writeFileSync(RUN_LOG_FILE, JSON.stringify(logData) + '\n', { flag: 'a' });
}

async function main() {
  console.log('🎭 Claude Code vs Codex Sentiment Analysis\n');

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Missing ANTHROPIC_API_KEY in .env file');
    console.error('   Get your key at: https://console.anthropic.com/');
    process.exit(1);
  }

  // Load data
  if (!existsSync(INPUT_FILE)) {
    console.error(`❌ ${INPUT_FILE} not found`);
    console.error('   Run "npm run filter-clean" first');
    process.exit(1);
  }

  console.log(`Reading ${INPUT_FILE}...`);
  const lines = readFileSync(INPUT_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const posts: RedditPost[] = lines.map(line => JSON.parse(line));

  console.log(`  Loaded ${posts.length} posts\n`);

  // Find all comments in threads mentioning both tools
  const analyzedIds = loadAnalyzedComments();
  const candidateComments: Array<{ comment: RedditComment; post: RedditPost; context: ThreadContext }> = [];

  console.log('🔍 Filtering for comparative comments...\n');

  for (const post of posts) {
    for (const comment of post.comments) {
      // Skip already analyzed
      if (analyzedIds.has(comment.id)) continue;

      // Build context
      const context = getThreadContext(comment, post.comments, post);

      // Check if thread mentions both tools
      if (mentionsBothTools(context.fullText)) {
        candidateComments.push({ comment, post, context });
      }
    }
  }

  console.log(`  Found ${candidateComments.length} comments in comparative threads`);
  console.log(`  Already analyzed: ${analyzedIds.size}`);
  console.log(`  To analyze: ${Math.min(candidateComments.length, BATCH_SIZE)}\n`);

  if (candidateComments.length === 0) {
    console.log('✓ No new comments to analyze');
    return;
  }

  // Analyze batch
  const batch = candidateComments.slice(0, BATCH_SIZE);
  let analyzed = 0;
  let errors = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const startTime = Date.now();

  console.log(`🤖 Analyzing ${batch.length} comments with ${MODEL}...\n`);

  for (let i = 0; i < batch.length; i++) {
    const { comment, post, context } = batch[i];

    try {
      const result = await analyzeSentiment(context, comment, post);
      saveSentiment(result);
      analyzed++;

      // Estimate tokens (rough)
      const inputTokens = Math.ceil(context.fullText.length / 4);
      const outputTokens = 200; // avg estimate
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      if (analyzed % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = analyzed / elapsed;
        const remaining = batch.length - analyzed;
        const eta = Math.round(remaining / rate);

        console.log(`  Progress: ${analyzed}/${batch.length}`);
        console.log(`  Rate: ${rate.toFixed(1)} comments/sec`);
        console.log(`  ETA: ${eta}s\n`);
      }

      // Rate limiting (be nice to API)
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`  ✗ Error analyzing comment ${comment.id}: ${error.message}`);
      errors++;
    }
  }

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  const inputCost = (totalInputTokens / 1_000_000) * 1.00; // Haiku pricing
  const outputCost = (totalOutputTokens / 1_000_000) * 5.00;
  const totalCost = inputCost + outputCost;

  // Log run metadata
  logRun({
    timestamp: Date.now(),
    model: MODEL,
    totalCandidates: candidateComments.length + analyzedIds.size,
    alreadyAnalyzed: analyzedIds.size,
    analyzedThisRun: analyzed,
    errors: errors,
    timeSeconds: totalTime,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    estimatedCost: totalCost,
    batchSize: BATCH_SIZE,
  });

  console.log(`\n✓ Analysis complete!`);
  console.log(`  Time: ${totalTime}s`);
  console.log(`  Analyzed: ${analyzed} comments`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Tokens: ${totalInputTokens.toLocaleString()} in, ${totalOutputTokens.toLocaleString()} out`);
  console.log(`  Cost: ~$${totalCost.toFixed(4)} (estimated)`);
  console.log(`  Saved to: ${OUTPUT_FILE}`);
  console.log(`  Run log: ${RUN_LOG_FILE}`);

  // Copy to dashboard for automatic refresh
  if (existsSync(OUTPUT_FILE)) {
    copyFileSync(OUTPUT_FILE, DASHBOARD_OUTPUT_FILE);
    console.log(`  Copied to: ${DASHBOARD_OUTPUT_FILE}`);
  }

  console.log(`\n💡 Run again to analyze next batch of ${Math.min(candidateComments.length - batch.length, BATCH_SIZE)} comments`);
}

main().catch(console.error);
