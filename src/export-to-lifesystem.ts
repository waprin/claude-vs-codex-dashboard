import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LIFESYSTEM_PATH = '/Users/williamprin/code/lifesystem/external';
const BLOG_DATA_FILE = path.join(__dirname, '../blog_data.jsonl');
const BLOG_URLS_FILE = path.join(__dirname, '../discovered_blog_urls.jsonl');

interface BlogPost {
  url: string;
  source: string;
  title: string;
  content: string;
  textContent: string;
}

interface BlogMetadata {
  url: string;
  title: string;
  discoveredAt: number;
  source: string;
  publishedDate?: string;
}

// Convert HTML title to clean markdown-friendly filename
function titleToFilename(title: string, date: Date): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50); // Keep it reasonable length
  return `${dateStr}-${cleanTitle}.md`;
}

// Extract date from discovered timestamp
function getDateFromTimestamp(timestamp: number): Date {
  return new Date(timestamp);
}

// Convert HTML content to cleaner markdown
function htmlToMarkdown(html: string, textContent: string): string {
  // For now, use textContent (plain text extracted from HTML)
  // Could enhance this with proper HTML->Markdown conversion later
  return textContent || 'Content not available';
}

// Determine importance (can be enhanced later with LLM scoring)
function determineImportance(title: string, content: string): 'high' | 'medium' | 'low' {
  const highPriorityKeywords = ['breaking', 'announcement', 'release', 'new', 'major'];
  const titleLower = title.toLowerCase();

  if (highPriorityKeywords.some(kw => titleLower.includes(kw))) {
    return 'high';
  }

  return 'medium';
}

// Extract tags from title and content
function extractTags(title: string, content: string): string[] {
  const tags: string[] = [];
  const text = (title + ' ' + content).toLowerCase();

  const tagMap: Record<string, string[]> = {
    'MCP': ['mcp', 'model context protocol'],
    'claude-code': ['claude code', 'claude-code'],
    'agent': ['agent', 'agents', 'agentic'],
    'sdk': ['sdk', 'software development kit'],
    'api': ['api'],
    'context': ['context window', 'context management'],
    'performance': ['performance', 'optimization', 'benchmark'],
    'release': ['release', 'announcement', 'launched'],
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }

  return tags.length > 0 ? tags : ['general'];
}

async function exportBlogPosts() {
  console.log('Reading blog data...');

  // Read JSONL files
  const blogDataContent = await fs.readFile(BLOG_DATA_FILE, 'utf-8');
  const blogUrlsContent = await fs.readFile(BLOG_URLS_FILE, 'utf-8');

  const blogPosts: BlogPost[] = blogDataContent
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

  const blogMetadata: BlogMetadata[] = blogUrlsContent
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));

  // Create metadata map for quick lookup
  const metadataMap = new Map(
    blogMetadata.map(meta => [meta.url, meta])
  );

  console.log(`Found ${blogPosts.length} blog posts`);

  // Ensure output directories exist
  const anthropicDir = path.join(LIFESYSTEM_PATH, 'anthropic');
  const indexesDir = path.join(LIFESYSTEM_PATH, '_indexes');

  await fs.mkdir(anthropicDir, { recursive: true });
  await fs.mkdir(indexesDir, { recursive: true });

  // Process each blog post
  const indexEntries: Array<{
    date: Date;
    source: string;
    title: string;
    importance: string;
    summary: string;
    filename: string;
  }> = [];

  for (const post of blogPosts) {
    const metadata = metadataMap.get(post.url);
    if (!metadata) {
      console.warn(`No metadata found for ${post.url}, skipping`);
      continue;
    }

    // Use publishedDate if available, otherwise fall back to discoveredAt
    const date = metadata.publishedDate
      ? new Date(metadata.publishedDate)
      : getDateFromTimestamp(metadata.discoveredAt);
    const filename = titleToFilename(post.title, date);
    const tags = extractTags(post.title, post.textContent);
    const importance = determineImportance(post.title, post.textContent);

    // Extract first paragraph as summary
    const paragraphs = post.textContent.split('\n\n').filter(p => p.trim().length > 0);
    const summary = paragraphs[0]?.slice(0, 200) || 'No summary available';

    // Create frontmatter
    const frontmatter = `---
source: ${post.source}
date: ${date.toISOString().split('T')[0]}
title: "${post.title.replace(/"/g, '\\"')}"
url: ${post.url}
tags: [${tags.join(', ')}]
importance: ${importance}
---

`;

    // Convert content to markdown
    const markdownContent = htmlToMarkdown(post.content, post.textContent);

    // Write individual post file
    const outputPath = path.join(anthropicDir, filename);
    await fs.writeFile(outputPath, frontmatter + markdownContent);
    console.log(`✓ Created ${filename}`);

    // Add to index
    indexEntries.push({
      date,
      source: post.source,
      title: post.title,
      importance,
      summary: summary.trim(),
      filename,
    });
  }

  // Generate recent-activity index (last 30 days)
  console.log('\nGenerating recent activity index...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentEntries = indexEntries
    .filter(entry => entry.date >= thirtyDaysAgo)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  let recentActivityMd = `# Recent Activity (Last 30 Days)

*Auto-generated from external sources*
*Last updated: ${new Date().toISOString().split('T')[0]}*

---

`;

  for (const entry of recentEntries) {
    const dateStr = entry.date.toISOString().split('T')[0];
    recentActivityMd += `## ${dateStr} | ${entry.source}
**${entry.title}** [${entry.importance}]
${entry.summary}
→ [[external/anthropic/${entry.filename}]]

`;
  }

  const recentActivityPath = path.join(indexesDir, 'recent-activity.md');
  await fs.writeFile(recentActivityPath, recentActivityMd);
  console.log(`✓ Created recent-activity.md with ${recentEntries.length} recent posts`);

  // Generate anthropic-specific index (all posts)
  let anthropicIndexMd = `# Anthropic Engineering Blog - Index

*Auto-generated from scraped blog posts*
*Last updated: ${new Date().toISOString().split('T')[0]}*
*Total posts: ${indexEntries.length}*

---

`;

  const sortedEntries = indexEntries.sort((a, b) => b.date.getTime() - a.date.getTime());

  for (const entry of sortedEntries) {
    const dateStr = entry.date.toISOString().split('T')[0];
    anthropicIndexMd += `## ${dateStr} - ${entry.title} [${entry.importance}]
${entry.summary}
→ [[external/anthropic/${entry.filename}]]

`;
  }

  const anthropicIndexPath = path.join(indexesDir, 'anthropic-index.md');
  await fs.writeFile(anthropicIndexPath, anthropicIndexMd);
  console.log(`✓ Created anthropic-index.md with ${indexEntries.length} posts`);

  console.log('\n✅ Export complete!');
  console.log(`\nOutput locations:`);
  console.log(`  Posts: ${anthropicDir}`);
  console.log(`  Indexes: ${indexesDir}`);
}

// Run the export
exportBlogPosts().catch(error => {
  console.error('Error exporting blog posts:', error);
  process.exit(1);
});
