# Lois & Clark: Reddit Sentiment Analysis Tool

A TypeScript-based tool for analyzing Reddit discussions comparing AI coding tools, with a focus on Claude Code vs Codex. Uses AI-powered sentiment analysis to identify trends, themes, and developer opinions.

## Features

- **Reddit Discovery**: Automatically finds relevant discussions across multiple subreddits
- **Smart Filtering**: Client-side filtering for comprehensive coverage without API limitations
- **AI-Powered Analysis**: Uses Claude API to analyze sentiment, extract themes, and identify quote-worthy comments
- **Interactive Dashboard**: Next.js-based dashboard with real-time filtering by subreddit, theme, and comparison type
- **Local-Only Architecture**: No database required - all data stored in JSONL files
- **Admin Mode**: Localhost-only controls for curating and cleaning data

## Architecture

### Pipeline Overview

```
1. Discovery (src/discover-reddit.ts)
   → Fetch posts from coding subreddits
   → Filter for comparative discussions
   → Save to discovered_urls.jsonl

2. Scraping (src/scrape.ts)
   → Read discovered URLs
   → Fetch full posts + comments
   → Save to reddit_data.jsonl

3. Analysis (src/analyze.ts)
   → Read reddit data
   → AI sentiment analysis via Claude
   → Save to sentiment_analysis.jsonl

4. Dashboard (dashboard/)
   → Next.js web app
   → Interactive filtering and visualization
   → Admin controls for data curation
```

### Tech Stack

- **Language**: TypeScript
- **Reddit API**: Snoowrap
- **AI Analysis**: Anthropic Claude API
- **Dashboard**: Next.js + React
- **Data Format**: JSONL (JSON Lines)

## Installation

### Prerequisites

- Node.js 18+ and npm
- Reddit API credentials (client ID, client secret, username, password)
- Anthropic API key

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
REDDIT_USERNAME=your_username
REDDIT_PASSWORD=your_password
REDDIT_USER_AGENT=lois-content-research/1.0.0

# Anthropic API
ANTHROPIC_API_KEY=your_api_key
ANALYSIS_MODEL=claude-3-5-haiku-20241022
```

## Usage

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

All data is stored in append-only JSONL format:
- `discovered_urls.jsonl`: Reddit URLs to scrape
- `reddit_data.jsonl`: Full posts with comments
- `reddit_data_clean.jsonl`: Filtered version (optional)
- `sentiment_analysis.jsonl`: AI analysis results
- `logs/runs.jsonl`: Analysis run metadata

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
