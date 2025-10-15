# Lois & Clark: Technical Documentation

This document contains detailed architectural decisions, design rationale, and implementation notes for contributors and maintainers.

For user documentation, see [README.md](README.md).

---

## Project Overview

A sentiment analysis pipeline that:
1. Discovers Reddit posts comparing AI coding tools
2. Scrapes complete discussion threads
3. Analyzes sentiment using Claude AI
4. Presents results in an interactive dashboard

This tool can be adapted to analyze any comparative discussions across different platforms.

---

## Design Decisions: Discovery Approach Evolution

### Attempt 1: Subreddit Hot Posts (Initial)
**Approach:** Use Reddit API to fetch hot posts from multiple subreddits
- Fetched top 50 hot posts per subreddit
- Covered 12 subreddits

**Problems:**
- Hot posts are incomplete (misses older discussions)
- No time-based filtering
- Can't ensure we get comprehensive coverage

---

### Attempt 2: Subreddit New Posts with Time Filtering
**Approach:** Use Reddit API `getNew()` with 2-month time window
- Fetched recent posts chronologically
- Added date filtering

**Problems:**
- Still relying on browsing one subreddit at a time
- No cross-platform search capability
- Limited to what we manually discover

---

### Attempt 3: Google Programmable Search API
**Approach:** Use Google Custom Search to discover Reddit threads
- Query: `"claude code" codex site:reddit.com`
- Leverage Google's index for comprehensive discovery

**Initial excitement:**
- Google indexes everything Reddit misses
- Cross-subreddit search
- Future-proof (easy to add HN, LinkedIn later)

**The hard reality - API limitations:**
- **100 results max per query** (start parameter caps at 91)
- Each query returns 10 results max
- Can only paginate: 1-10, 11-20, ..., 91-100
- After 100 results, Google stops returning more

**When we tested:**
```
Query: "claude code" codex site:reddit.com
Total results available: 58,800+
Results we can get: 100 (0.17% coverage!)
```

**Scale of the problem:**
- ~58,800 Reddit discussions mention both "claude code" and "codex"
- Google's 100-result cap means we'd miss 58,700+ discussions (99.8% of data)
- Even with time-based segmentation (588 queries needed), would take 6+ days to discover URLs
- This massive volume proves we need a different approach

**Workarounds considered:**
1. **Time-based segmentation** - Daily/weekly queries
   - Problem: Would need 588 queries to get all results
   - Google free tier: 100 queries/day
   - Would take 6+ days just to discover URLs

2. **Query variations** - Different search terms
   - Problem: Mostly returns duplicate results
   - Still capped at 100 per variant

3. **Subreddit-specific queries**
   - Problem: Still 100-result cap per subreddit
   - Doesn't solve the fundamental limitation

**Verdict:** Google API is not viable for comprehensive Reddit scraping when 58,800 results exist.

---

### Attempt 4: Direct Reddit API with Client-Side Filtering (Current Implementation)

**Key advantages:**
- Reddit API is free (60 req/min rate limit)
- No artificial result caps (unlike search APIs)
- Can paginate through entire subreddits
- Client-side filtering is 100% reliable (no search algorithm quirks)

**Subreddit Selection Strategy:**

Initial consideration: 12 general AI subreddits (ClaudeAI, Cursor, ChatGPTCoding, Anthropic, OpenAI, LLMDevs, vibecoding, codex, mcp, AI_Agents, OpenaiCodex, VibeCodeDevs)

**Challenge with broad approach:**
- Large subreddits generate 10k-100k+ posts/week
- Mix of technical and non-technical content
- High noise-to-signal ratio

**Implemented approach:**
Focus on 3 coding-specific subreddits:
- **/r/ClaudeCode**: Claude Code specific discussions
- **/r/codex**: Codex specific discussions
- **/r/ChatGPTCoding**: General AI coding discussions

**Performance characteristics:**
- ~75,000 posts scanned over 2.5 month window
- ~750 API calls at 100 posts/call
- ~13 minutes runtime at 60 req/min
- Client-side filtering for posts containing both comparison terms

**Volume estimates:**
- Total posts scanned: ~75,000
- Expected comparative posts: 1,000-5,000
- Comments per post: 20-100 average
- Total comments to analyze: 20,000-500,000

**Cost analysis:**
- Reddit API: Free (within rate limits)
- LLM sentiment analysis with Claude Haiku (~$0.25 per 1M input tokens):
  - 50k comments: ~$2.50 per run
  - 150k comments: ~$7.50 per run
  - Typical usage: ~$10-30/month

**Why this approach:**
1. **Comprehensive**: Captures all posts from target subreddits
2. **Reliable**: No missed results from search algorithms
3. **Cost-effective**: Free discovery, affordable analysis
4. **Fast**: Minutes to discover, not hours
5. **Focused**: High signal-to-noise ratio
6. **Scalable**: Easy to add more subreddits or adjust timeframes

---

## Architecture

### Pipeline Flow
```
1. Reddit Discovery (src/discover-reddit.ts)
   ↓
   Fetch all posts from coding subreddits (last 2.5 months)
   ↓
   Filter: title/selftext contains "claude code" AND "codex"
   ↓
   Save to: discovered_urls.jsonl

2. Reddit Scraping (src/scrape.ts)
   ↓
   Read discovered_urls.jsonl
   ↓
   Fetch full post + all comments via Reddit API
   ↓
   Save to: reddit_data.jsonl

3. Sentiment Analysis (src/analyze.ts)
   ↓
   Read reddit_data.jsonl
   ↓
   Run LLM sentiment analysis on comments
   ↓
   Generate report
```

### Data Formats

**discovered_urls.jsonl** (one JSON object per line):
```json
{"url":"https://reddit.com/r/ClaudeCode/comments/abc123/...","title":"...","snippet":"...","discoveredAt":1697123456789,"query":"reddit_api"}
```

**reddit_data.jsonl** (one JSON object per line):
```json
{"postId":"abc123","subreddit":"ClaudeCode","title":"...","selftext":"...","score":42,"url":"...","permalink":"...","author":"...","created":1697123456,"numComments":50,"comments":[{"id":"def456","text":"...","score":10,"author":"...","created":1697123457}]}
```

**sentiment_analysis.jsonl** (one JSON object per line):
```json
{"commentId":"abc123","postId":"xyz789","subreddit":"ClaudeCode","permalink":"...","comparison":"codex_better","claudeCodeSentiment":"negative","codexSentiment":"positive","reasoning":"...","themes":["performance","bugs"],"quoteWorthy":true,"quote":"...","score":42,"model":"claude-3-5-haiku-20241022","analyzedAt":1697123456789}
```

**Comparison field values:**
- `claude_code_better` - Direct comparison favoring Claude Code over Codex 🏆
- `codex_better` - Direct comparison favoring Codex over Claude Code 🏆
- `equal` - Both tools rated equally ⚖️
- `claude_code_only_positive` - Only discusses Claude Code positively 👍📘
- `claude_code_only_negative` - Only discusses Claude Code negatively 👎📘
- `codex_only_positive` - Only discusses Codex positively 👍📗
- `codex_only_negative` - Only discusses Codex negatively 👎📗
- `neither` - Discussing neither tool favorably ❌
- `off_topic` - Not actually comparing the tools (e.g., GLM, Cursor) ⚠️

**Why positive/negative split for *_only:**
- Comments like "Claude Code has been buggy lately" don't compare to Codex but are negative
- Comments like "Codex is amazing for Python" don't compare to Claude Code but are positive
- This distinction matters for understanding overall sentiment per tool

**Dashboard visualization:**
- Main breakdown shows all 9 categories with counts and percentages
- "Among Clear Preference" section shows head-to-head (claude_code_better vs codex_better only)
- Single-tool comments grouped with border colors (green for positive, red for negative)
- Each comment card displays comparison category with color-coded badge
- Off-topic comments can be ignored in admin mode to clean up analysis

### Benefits of JSONL Format
- Append-only (incremental updates)
- Easy deduplication (read once, check IDs)
- Works with streaming processors
- Git-friendly (line-based diffs)

### Dashboard Architecture (Next.js)

**Local-only architecture:**
- Dashboard is a Next.js app in `/dashboard` directory
- Reads `sentiment_analysis.jsonl` from `/dashboard/public/` directory
- NO DATABASE - All data stored in local JSONL files
- NO FIREBASE - Firebase MCP is available in the project but NOT used for this app
- Stats calculated client-side in React
- Ignored comments tracked in browser localStorage

**Data Flow:**
```
src/analyze.ts
  ↓
  Writes to: sentiment_analysis.jsonl (root dir)
  ↓
  Copies to: dashboard/public/sentiment_analysis.jsonl
  ↓
  Dashboard fetches from: /sentiment_analysis.jsonl (public static file)
  ↓
  React state + localStorage for UI interactions
```

**Why local-only:**
- Simple deployment (no backend needed)
- Fast iteration (no DB schema changes)
- Version controlled (JSONL in git)
- Zero infra cost

**Admin Mode (localhost only):**
- Automatically enabled when `window.location.hostname === 'localhost'`
- Shows ignore controls for filtering out irrelevant comments
- Two ignore options:
  1. **Ignore Comment**: Excludes single comment from stats
  2. **Ignore Thread**: Excludes all comments in that Reddit post from stats
- Ignored state persists in browser localStorage
- Production deployment automatically hides admin controls
- Use cases:
  - Filter out off-topic discussions (e.g., GLM, Cursor, other tools)
  - Remove spam or low-quality comments
  - Clean up dataset without modifying JSONL files

---

## Key Lessons Learned

1. **API limits matter more than API features**
   - Google's search is powerful but 100-result cap kills it
   - Reddit's simpler API has no artificial caps

2. **Free tiers can be more useful than paid tiers**
   - Reddit free: unlimited results
   - Google free: 100 results max, 100 queries/day

3. **Client-side filtering > server-side search**
   - Reddit search is unreliable
   - Fetching everything + filtering locally = 100% coverage

4. **Narrow focus beats broad coverage**
   - 3 coding subreddits > 12 general subreddits
   - 7.5k targeted posts > 100k+ noisy posts

5. **Volume estimates are critical before implementation**
   - Testing Google query showed 58,800 results (too many)
   - Calculating Reddit volume showed 75k posts (manageable)

6. **Always check "total results" metadata**
   - Helps detect when you're hitting caps
   - Informs whether approach is viable

---

## Extending the System

### Adding New Platforms

The architecture is designed to support multiple discussion platforms. To add a new platform:

1. **Create discovery module** (`src/discover-[platform].ts`):
   - Fetch posts/threads from platform API
   - Filter for comparison keywords
   - Output to `discovered_urls.jsonl`

2. **Create scraper module** (`src/scrape-[platform].ts`):
   - Read discovered URLs
   - Fetch full content + comments
   - Normalize to common format
   - Output to `reddit_data.jsonl` (or platform-specific file)

3. **Update analysis** (`src/analyze.ts`):
   - Ensure prompt handles platform-specific formatting
   - Add platform field to output schema

**Potential platforms:**
- Hacker News (YCombinator API)
- Dev.to (REST API)
- Twitter/X (API v2)
- GitHub Discussions (GraphQL API)
- Stack Overflow (REST API)

### Adding New Comparison Topics

To compare different tools (e.g., Cursor vs Windsurf):

1. **Update discovery keywords** in `src/discover-reddit.ts`:
   ```typescript
   const KEYWORDS = {
     tool1: 'cursor',
     tool2: 'windsurf'
   };
   ```

2. **Update analysis prompt** in `src/analyze.ts`:
   - Modify comparison categories
   - Adjust sentiment classification

3. **Update dashboard** in `dashboard/app/page.tsx`:
   - Update UI labels
   - Adjust color schemes if needed

### Advanced Features

**Time-series tracking:**
- Add `analyzedWeek` or `analyzedMonth` field
- Create time-series visualization component
- Track sentiment changes over time

**Topic clustering:**
- Extract themes into separate collection
- Use embeddings for semantic clustering
- Create theme relationship graphs

**Export functionality:**
- Add CSV export for Excel analysis
- Generate PDF reports with charts
- Create shareable public dashboards

**Automation:**
- Add cron jobs for scheduled runs
- Implement webhook notifications
- Create digest email summaries

### Performance Optimization

**Batch processing:**
- Current: 500 comments per run
- Consider: Parallel processing with multiple API keys
- Rate limiting: Respect API constraints

**Caching:**
- Cache Reddit posts to avoid re-fetching
- Store intermediate analysis results
- Implement incremental updates

**Database migration:**
- Current: JSONL files (simple, version-controlled)
- Consider: SQLite for complex queries
- Alternative: PostgreSQL for production scale

---

## Implementation Notes

### File References

- Subreddit list: `src/discover-reddit.ts:15-20`
- Batch size configuration: `src/analyze.ts:16`
- Dashboard filters: `dashboard/app/page.tsx:700-760`
- Analysis prompt: `src/analyze.ts:124-159`

### Archived Code

- Google discovery script: `src/discover-google.ts` (kept for reference)
- Contains working implementation of Google Custom Search API
- Demonstrates API limitations encountered

### Data Migration

When updating comparison categories or schema:
1. Keep old analysis files as backup
2. Document breaking changes in commit messages
3. Consider writing migration scripts for large datasets
4. Dashboard handles missing fields gracefully

---

## Contributing

See [README.md](README.md) for contribution guidelines.

For questions or discussions, open an issue on GitHub.
