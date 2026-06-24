# Blog Scraper Implementation Status

## What's Done

Created two new modules following the same pattern as the Reddit scraper:

### 1. `src/discover-blogs.ts`
- Discovers blog posts from AI engineering blogs
- Currently configured for Anthropic engineering blog (https://www.anthropic.com/engineering/)
- Parses HTML to extract article URLs (pattern: `/engineering/article-slug`)
- Outputs to: `discovered_blog_urls.jsonl`
- Easy to extend with more blog sources (OpenAI, Google AI, etc.)

### 2. `src/scrape-blogs.ts`
- Scrapes full content from discovered blog posts
- Extracts: title, full HTML content, text content, publish date, author, tags
- Outputs to: `blog_data.jsonl`
- Uses simple HTML-to-text conversion for clean text extraction
- Rate limiting: 1 second between requests

### 3. Updated `package.json`
Added new scripts:
- `npm run discover:blogs` - Run blog discovery
- `npm run scrape:blogs` - Scrape discovered blog posts

## Data Format

**discovered_blog_urls.jsonl:**
```json
{"url":"https://www.anthropic.com/engineering/article-slug","title":"...","snippet":"...","discoveredAt":1697123456789,"source":"Anthropic Engineering","publishedDate":"2024-01-15"}
```

**blog_data.jsonl:**
```json
{"url":"...","source":"Anthropic Engineering","title":"...","content":"<html>...","textContent":"clean text...","publishedDate":"2024-01-15","author":"...","tags":[],"scrapedAt":1697123456789}
```

## Next Steps (After Node Fix)

1. Test discovery: `npm run discover:blogs`
2. Test scraping: `npm run scrape:blogs`
3. Verify output files are created correctly
4. Optionally: Add more blog sources (OpenAI, Google AI, etc.)
5. Optionally: Integrate with analysis pipeline if needed

## Architecture Notes

- Follows same JSONL append-only pattern as Reddit scraper
- No external dependencies needed (uses native fetch)
- Simple HTML parsing (regex-based, can upgrade to cheerio if needed)
- Easily extensible for multiple blog sources
