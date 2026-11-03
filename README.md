# Lois & Clark: Reddit Sentiment Analysis Tool

A TypeScript-based tool for analyzing Reddit discussions comparing AI coding tools, with a focus on Claude Code vs Codex. Uses AI-powered sentiment analysis to identify trends, themes, and developer opinions.

**🔗 [View Live Dashboard](https://claude-vs-codex-dashboard.vercel.app/)**

## Project Status

This repo contains several pipelines that grew out of the original sentiment-analysis work. Not all of them are equally maintained. Here is the current state as of November 2026:

| Pipeline | Status | Entry points | Output |
|---|---|---|---|
| **Sentiment analysis** (Claude Code vs Codex) | Active, powers the live dashboard | `discover`, `scrape`, `analyze`, `dashboard` | `sentiment_analysis.jsonl` |
| **Claude Code tips, v2** | Active, current approach | `discover:tips:v2`, `scrape:tips`, `analyze:tips` | `extracted_tips.jsonl` |
| **Claude Code tips, v1** | Deprecated, superseded by v2 | `discover:tips`, `fetch:tips`, `extract:tips` | `claude_code_tips.jsonl` |
| **Anthropic blog scraper** | Side experiment | `discover:blogs`, `scrape:blogs`, `export` | `blog_data.jsonl` |
| **Twitter metrics** | Side experiment | `scrape:twitter` | `twitter_data.jsonl` |
| **Google discovery** | Archived, kept for reference | `discover:google` | n/a |

All Reddit-facing scripts share one client in `src/reddit-client.ts`, which authenticates with the client-credentials grant. Only a client ID and secret are needed; no Reddit username or password.

Everything is local-only: no database, all data lives in append-only JSONL files at the repo root, and the dashboard reads a copy of `sentiment_analysis.jsonl` from `dashboard/public/`.

## Features

- **Reddit Discovery**: Automatically finds relevant discussions across multiple subreddits
- **Smart Filtering**: Client-side filtering for comprehensive coverage without API limitations
- **AI-Powered Analysis**: Uses Claude API to analyze sentiment, extract themes, and identify quote-worthy comments
- **Interactive Dashboard**: Next.js-based dashboard with real-time filtering by subreddit, theme, and comparison type
- **Local-Only Architecture**: No database required - all data stored in JSONL files
- **Admin Mode**: Localhost-only controls for curating and cleaning data

## Architecture

### Sentiment Pipeline Overview

```
1. Discovery (src/discover-reddit.ts)
   → Fetch posts from coding subreddits
   → Filter for comparative discussions
   → Save to discovered_urls.jsonl

2. Scraping (src/scrape.ts)
   → Read discovered URLs
   → Fetch full posts + comments (with parentId and depth per comment)
   → Save to reddit_data.jsonl

3. Analysis (src/analyze.ts)
   → Read reddit data
   → For each comment, build context from the post plus its ancestor comment chain
   → AI sentiment analysis via Claude on the last comment in that chain
   → Save to sentiment_analysis.jsonl

4. Dashboard (dashboard/)
   → Next.js web app
   → Interactive filtering and visualization
   → Admin controls for data curation
```

### Tech Stack

- **Language**: TypeScript
- **Reddit API**: Snoowrap (via `src/reddit-client.ts`)
- **AI Analysis**: Anthropic Claude API
- **Dashboard**: Next.js + React
- **Data Format**: JSONL (JSON Lines)

## Installation

### Prerequisites

- Node.js 18+ and npm
- Reddit API credentials (client ID and client secret from a Reddit "script" app; no username/password needed)
- Anthropic API key
- Optional: Google Custom Search key and engine ID (only used by the tips v2 discovery step)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/loisandclark.git
cd loisandclark
```

2. Install dependencies:
```bash
npm install
cd dashboard && npm install && cd ..
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
# Reddit API
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_USER_AGENT=lois-content-research/1.0.0

# Optional: Google Custom Search (tips v2 discovery only)
GOOGLE_CUSTOM_SEARCH_KEY=your_google_api_key
GOOGLE_CUSTOM_SEARCH_CX=your_search_engine_id

# Anthropic API
ANTHROPIC_API_KEY=your_api_key
ANALYSIS_MODEL=claude-3-5-haiku-20241022
```

## Usage: Sentiment Pipeline

### 1. Discover Reddit Posts

Find posts mentioning both "Claude Code" and "Codex":

```bash
npm run discover
```

This creates `discovered_urls.jsonl` with matching Reddit threads.

### 2. Scrape Comments

Fetch full posts and all comments:

```bash
npm run scrape
```

This creates `reddit_data.jsonl` with complete thread data.

### 3. Run Sentiment Analysis

Analyze comments with AI:

```bash
npm run analyze
```

This creates `sentiment_analysis.jsonl` with:
- Sentiment classification (positive/negative/neutral)
- Comparison category (which tool is preferred)
- Themes discussed (performance, bugs, UI, etc.)
- Quote-worthy excerpts
- Upvote counts

The analysis runs in batches (default: 500 comments per run) and can be re-run to process more comments incrementally.

### 4. Launch Dashboard

View results in the interactive dashboard:

```bash
npm run dashboard
```

Open [http://localhost:3000](http://localhost:3000) to explore:
- Overall sentiment breakdown
- Filter by subreddit, theme, or comparison type
- Sort by upvotes or recency
- Toggle upvote weighting
- Admin mode (localhost only) for curating data

### Optional: Clean Dataset

`npm run filter-clean` writes `reddit_data_clean.jsonl`, which keeps only posts discovered via the Reddit API and drops any that came from the archived Google discovery experiment.

## Usage: Claude Code Tips Pipeline

A second pipeline that mines r/ClaudeCode for practical tips and tricks rather than comparative sentiment. There are two versions. **Use v2.** v1 is kept only because its data file still exists; it is slated for removal.

### v2 (current)

```
1. Discovery (src/discover-tips-v2.ts)         npm run discover:tips:v2
   → Paginate r/ClaudeCode getNew() and getTop() (up to 1,000 posts each)
   → Optionally add Google Custom Search results for feature-specific queries
     (hooks, MCP, subagents, CLAUDE.md, plan mode, etc.)
   → Dedupe, no content filtering
   → Save to discovered_tip_posts.jsonl

2. Scraping (src/scrape-tips.ts)               npm run scrape:tips
   → Fetch each post and its full comment tree
   → Every comment carries parentId and depth
   → Save to tip_posts_full.jsonl

3. Extraction (src/analyze-tips.ts)            npm run analyze:tips
   → One prompt per post: post body plus top 30 comments by score
   → Claude extracts tips with category, advanced flag, and source comment
   → One line per tip, resumable across runs
   → Save to extracted_tips.jsonl
```

### v1 (deprecated)

```
1. Discovery (src/discover-tips.ts)            npm run discover:tips
   → Fetch small listings from r/ClaudeCode (top/hot/new plus keyword searches)
   → Score each post with a keyword and engagement heuristic
   → Keep only posts that look like tips
   → Save to claude_code_tips.jsonl

2. Extraction (src/extract-tips.ts)            npm run extract:tips
   → Take top 50 posts by heuristic score
   → Fetch only the single highest-scored comment per post
   → Claude extracts tips
   → Save to extracted_tips.jsonl (one line per post, nested tips array)

Helpers:
   src/fetch-top-tips.ts     npm run fetch:tips    → top_tips_content.jsonl
   src/analyze-tip-volume.ts                       → cost estimate, no output file
```

### Relationship between v1 and v2

- They are independent chains. They share only the Reddit client and the final output filename.
- **Where filtering happens.** v1 filters at discovery with a keyword heuristic. v2 collects everything and lets the LLM decide what is a tip.
- **Comment coverage.** v1 reads one comment per post. v2 scrapes the whole thread and feeds the top 30 comments into the prompt.
- **Resumability.** v1 extraction re-processes the same posts on every run. v2 tracks analyzed post IDs and skips them.
- **Output schema.** Both write to `extracted_tips.jsonl`, but with incompatible shapes. v1 writes one record per post with a nested `tips[]` array. v2 writes one flat record per tip with `sourcePostId`, `sourceCommentId`, and `sourceCommentScore`. The file currently on disk is in v2 shape. **Do not run v1 extraction against it** or the schemas will mix.

### Known gap in v2

The sentiment pipeline already builds per-comment context by walking each comment's ancestor chain up to the post (see `getThreadContext` in `src/analyze.ts`). The tips extractor does not yet use that structure: it flattens comments into a score-sorted list, so replies lose the comment they were responding to, and slicing by score can orphan replies whose parents fell below the cutoff. The scraped data already has everything needed to fix this. The planned direction is to move the context builder into a shared module and have the tips extractor render comments as a pruned thread tree.

## Side Experiments

These are not part of the main pipelines and may be rough.

- **Anthropic blog scraper.** `npm run discover:blogs` writes `discovered_blog_urls.jsonl`, `npm run scrape:blogs` writes `blog_data.jsonl`, and `npm run export` converts blog data into markdown files for an external notes system.
- **Twitter metrics.** `npm run scrape:twitter` pulls recent tweets and engagement metrics for a user via the Twitter API v2 into `twitter_data.jsonl`.
- **Google discovery.** `src/discover-google.ts` is the archived Google Custom Search approach. It is kept to document why it was abandoned (100-result cap per query). See [CLAUDE.md](CLAUDE.md) for the full story.

## Data Format

### Comparison Categories

The analysis classifies each comment into one of 9 categories:

- 🏆 **claude_code_better**: Direct comparison favoring Claude Code
- 🏆 **codex_better**: Direct comparison favoring Codex
- ⚖️ **equal**: Both tools rated equally
- 👍 **claude_code_only_positive**: Only discusses Claude Code (positive)
- 👎 **claude_code_only_negative**: Only discusses Claude Code (negative)
- 👍 **codex_only_positive**: Only discusses Codex (positive)
- 👎 **codex_only_negative**: Only discusses Codex (negative)
- ❌ **neither**: Neither tool discussed favorably
- ⚠️ **off_topic**: Not comparing the tools

### JSONL Files

All data is stored in append-only JSONL format.

Sentiment pipeline:
- `discovered_urls.jsonl`: Reddit URLs to scrape
- `reddit_data.jsonl`: Full posts with comments
- `reddit_data_clean.jsonl`: Filtered version (optional)
- `sentiment_analysis.jsonl`: AI analysis results
- `logs/runs.jsonl`: Analysis run metadata

Tips pipeline (v2):
- `discovered_tip_posts.jsonl`: Post IDs and URLs from Reddit and Google
- `tip_posts_full.jsonl`: Full posts with threaded comments
- `extracted_tips.jsonl`: One line per extracted tip

Tips pipeline (v1, deprecated):
- `claude_code_tips.jsonl`: Heuristically filtered posts
- `top_tips_content.jsonl`: Posts with top comments

Side experiments:
- `discovered_blog_urls.jsonl`, `blog_data.jsonl`: Anthropic blog content
- `twitter_data.jsonl`: Tweet metrics

See [CLAUDE.md](CLAUDE.md) for detailed schema documentation.

## Configuration

### Analysis Model

Change the AI model in `.env`:
```env
ANALYSIS_MODEL=claude-3-5-haiku-20241022
# or
ANALYSIS_MODEL=claude-3-5-sonnet-20241022
```

### Batch Size

Adjust batch size in `src/analyze.ts`:
```typescript
const BATCH_SIZE = 500; // Comments per run
```

### Target Subreddits

Edit subreddit list in `src/discover-reddit.ts`:
```typescript
const SUBREDDITS = [
  'ClaudeCode',
  'codex',
  'ChatGPTCoding'
];
```

## Cost Estimates

- **Reddit API**: Free (60 requests/min)
- **Analysis**: ~$0.005 per comment with Haiku
  - 500 comments = ~$2.50
  - 1000 comments = ~$5.00

## Development

See [CLAUDE.md](CLAUDE.md) for detailed architectural decisions and development notes.

See [NOTES.md](NOTES.md) for project planning and personal notes.

## Contributing

Contributions welcome! Areas for improvement:

- Remove the deprecated v1 tips pipeline
- Thread-aware context for tips extraction (see "Known gap in v2" above)
- Additional AI tool comparisons (Cursor, Windsurf, etc.)
- Multi-platform support (Hacker News, Twitter, etc.)
- Advanced visualizations
- Time-series sentiment tracking
- Export functionality (CSV, PDF)

## License

MIT License - see LICENSE file for details.

## Acknowledgments

Built with:
- [Anthropic Claude API](https://www.anthropic.com/)
- [Snoowrap](https://github.com/not-an-aardvark/snoowrap) - Reddit API wrapper
- [Next.js](https://nextjs.org/) - Dashboard framework
