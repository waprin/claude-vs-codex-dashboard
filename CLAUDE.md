# Lois & Clark: Reddit Sentiment Analysis Tool

## Project Goal
Build a sentiment analysis tool to compare Claude Code vs Codex using Reddit discussions.

---

## Discovery Approach Evolution

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

### Attempt 4: Direct Reddit API with Client-Side Filtering (Current)

**The realization:**
- Reddit API is **FREE** for our use case (60 req/min)
- No 100-result artificial cap
- Can paginate through entire subreddits
- Client-side filtering is 100% reliable (no search algorithm quirks)

**Subreddit selection strategy:**

Initial list (12 subreddits):
- ClaudeAI, Cursor, ChatGPTCoding, Anthropic, OpenAI, LLMDevs, vibecoding, codex, mcp, AI_Agents, OpenaiCodex, VibeCodeDevs

**Problem with broad approach:**
- /r/ClaudeAI: 11k posts/week (lots of coding + non-coding)
- /r/OpenAI: 104k posts/week (mostly non-coding)
- /r/Anthropic: Mix of research + coding
- Fetching all = 150k+ posts = high noise

**Refined approach - Coding-focused subreddits:**
Focus on 3 coding-specific subreddits:
- **/r/ClaudeCode**: 4.6k posts/week (Claude Code specific)
- **/r/codex**: 1.2k posts/week (Codex specific)
- **/r/ChatGPTCoding**: 1.7k posts/week (coding-focused)

**Total volume:**
- 7.5k posts/week × 10 weeks (2.5 months) = **75,000 posts**
- At 100 posts/API call = **750 API calls**
- At 60 req/min = **~13 minutes runtime**
- Filter client-side for posts containing both "claude code" AND "codex"

**Realistic volume estimates:**
- Scanning: 75,000 posts from 3 subreddits
- Expected matches: Unknown, but Google shows 58,800+ results exist across all of Reddit
- Conservative estimate: 1,000-5,000 matching posts in our 3 coding-focused subreddits
- Comments per post: 20-100 average
- **Total comments to analyze: 20,000-500,000**

**Cost analysis:**
- Reddit API: **$0/month** (free tier handles this easily)
- LLM sentiment analysis:
  - Conservative: 1,000 posts × 50 comments = 50k comments
  - Realistic: 2,000-3,000 posts × 50 comments = 100k-150k comments
  - Claude Haiku (~$0.25 per 1M input tokens, ~200 tokens per comment):
    - 50k comments = ~$2.50 per run
    - 150k comments = ~$7.50 per run
  - Weekly runs: **~$10-30/month**
- **Total: Well under $50/month budget**

**Why this approach wins:**
1. **Comprehensive**: Gets every post from target subreddits
2. **Reliable**: Client-side filtering never misses matches
3. **Cost-effective**: Free scraping, cheap LLM analysis
4. **Fast**: ~15 minutes to discover all URLs
5. **Coding-focused**: Low noise, high signal
6. **Scalable**: Easy to add more subreddits later

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

### Benefits of JSONL Format
- Append-only (incremental updates)
- Easy deduplication (read once, check IDs)
- Works with streaming processors
- Git-friendly (line-based diffs)

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

## Future Enhancements

### Multi-platform expansion
- Hacker News (YCombinator)
- Dev.to
- LinkedIn posts
- Twitter/X threads
- GitHub discussions

### Advanced filtering
- Sentiment scoring per comment
- Topic clustering (bugs, features, comparisons)
- Time-series sentiment tracking
- User engagement metrics (power users, new users)

### Automation
- Daily/weekly scheduled runs
- Email digest of top insights
- Slack/Discord notifications for significant sentiment shifts

---

## Notes

- Subreddit list preserved in `src/scrape.ts:20-22` for reference
- Google discovery script archived as `src/discover-google.ts` (kept for reference)
- Main discovery now uses `src/discover-reddit.ts`
