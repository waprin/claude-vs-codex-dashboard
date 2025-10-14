AI Content Research Tool - Project BriefContext
Building an AI-powered tool to identify emotional trends in developer discussions about AI tools, specifically to improve content topic selection for AIER (AI Engineering Report - Substack/YouTube on AI engineering).The core insight: My viral post (37K views) "Devs Cancel Claude Code En Masse" worked because it captured emotional trends, not because it was technically comprehensive. It synthesized scattered frustration into a narrative using Reddit comments and quotes.Current Goal
Get a YouTube video out next week (addressing 2-week publishing gap). Two possible paths based on what the data reveals:Path A: "I Analyzed 500+ Reddit Comments on Claude Code vs Codex" (sentiment analysis)
Path B: "Building an AI Agent with [Anthropic/OpenAI] SDK" (agent build)Strategy: Build first, decide which story to tell based on what's interesting.Technical Stack

Language: TypeScript (staying consistent with React/React Native work)
Reddit API: Snoowrap library
AI SDKs to explore:

Anthropic Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
OpenAI Agents SDK (@openai/agents)


Phase 1: Data Gathering (Do First)Objective
Scrape Reddit posts and comments from AI coding tool subreddits to analyze developer sentiment.Subreddits to Target

r/ClaudeAI
r/Cursor
r/LocalLLaMA
(Optional: Hacker News if time permits)
Data Requirements

Top 50 posts from last 7 days per subreddit
Filter for posts with >50 upvotes
Capture top 10-20 comments per post with upvote counts
Include: title, score, URL, comment text, comment scores, authors
Reddit API Notes

Free tier: 100 queries per minute (plenty for this use case)
Use OAuth authentication
Need: client ID, client secret, refresh token
Estimated: ~200-300 API calls total for full scrape
Deliverable
reddit_data.json file with structured data ready for analysis.Phase 2: Quick Analysis (Evaluate Direction)Objective
Feed raw data to Claude/GPT to see what emotional trends emerge. This determines which video to make.Analysis Questions

What are the top 3 emotional trends? (frustration, excitement, confusion, surprise)
What specific issues are most upvoted/discussed?
What are developers praising?
Any surprising patterns or contradictions?
Best quotes that capture sentiment?
Decision Point
After analysis, choose video direction:

If data is compelling: Make sentiment analysis video this week
If process is more interesting than results: Make agent SDK build video
If data reveals specific pattern: Build agent to investigate deeper
Phase 3A: Sentiment Analysis Video (Path A)Approach
Simple script approach - no agent SDK needed yet.Process:

Load reddit_data.json
Send to Claude API with analysis prompt
Generate markdown report with:

Top trends ranked by emotional intensity + volume
Key quotes with context
Links to threads
Simple data visualizations (bar charts of sentiment)


Video Structure (6-8 min)

Hook: "I analyzed 500+ Reddit comments..." (show data/chart)
The findings (3-4 min): trends, quotes, visualizations
Meta reveal (2 min): "Why I'm building an agent to automate this"
Setup next video: "Next time I'll show you the build"
Content Notes

Lead with data ("I got data" = authority)
Use simple visualizations (don't over-engineer graphics)
Can steal/adapt community-made charts with credit
This IS the manual version of what the agent will do
Phase 3B: Agent SDK Build (Path B)Objective
Build actual agent with loop behavior, not just RAG pipeline.What makes it a real agent:

Reads data → identifies potential trend
Decides "I need more evidence"
Searches autonomously for supporting data
Evaluates confidence
Loops until satisfied or exhausted
Minimal Agent Scope (v0.1)
Input: reddit_data.json
Agent loop:
1. Read posts/comments, identify potential trends
2. Generate 2-3 hypothesis titles
3. Search data for supporting evidence
4. Evaluate: Is this trend strong enough? (confidence score)
5. If yes: output trend + evidence. If no: try next hypothesis
6. Repeat until trends found or exhausted
Output: Markdown report with ranked trendsSDK Comparison NotesAnthropic Claude Agent SDK:

Code-first, full control
Built on Claude Code infrastructure
Supports: file operations, bash, web search, MCP
Philosophy: Give Claude same tools programmers use
OpenAI AgentKit:

Visual builder (Agent Builder) + code SDK
Both use same Responses API underneath
Can prototype visually, drop to code when needed
Philosophy: Make agents accessible, visual-first option
Video Structure (6-8 min)

Hook: "Everyone's talking about agents. Here's what it takes to build one"
Context: Mention both SDKs, explain choice
Build walkthrough (4-5 min): show actual code, explain agent loop, debug on camera
Reflection: What I learned about agent behavior
Teaser: "Next I'll try the other SDK to compare"
Agent Definition (Important)NOT an agent:

Scrape → LLM analysis → output
No loops, no decisions, just RAG/analysis pipeline
IS an agent:

Gathers context → takes action → verifies → makes decision → loops
Autonomous searching based on findings
Evaluates own work and decides next steps
Don't call it an agent unless it has actual agent behavior (planning loops, decisions, autonomy).Content Strategy NotesMultiple Goals for This Project

Improve content pipeline (better topic selection)
Create content about building it (meta-content)
Demonstrate AI engineering skills
Learn/practice with AI SDKs I'm writing about
Active AI project to point to (poker app LPT in maintenance)
Key Constraint
Avoid spending weeks building infrastructure without shipping content. Every 6-8 hours of work should produce publishable content.What Makes Content Work
From the 37K view post experience:

Lead with data/stats (authority)
Capture emotional trends, not just technical facts
Quote actual developers (Reddit, YouTube transcripts)
Simple but compelling visualizations
Timely topics (capture sentiment while hot)
Content Ideas From This Build

Week 1: Sentiment analysis OR agent build (depending on Phase 2 results)
Week 2: The other one (agent build OR sentiment analysis)
Week 3: Comparison if did both SDKs, or topic found using the tool
Backup: "Claude Code vs Codex: Reddit Sentiment Analysis" (proven format)
Development NotesTime Budget

Phase 1 (scraping): 2 hours
Phase 2 (quick analysis): 30 min
Decision point: Which path?
Phase 3: 4-5 hours (either path)
Video filming/editing: 2-3 hours
Total: 8-10 hours for content out next week
Recording Strategy
Don't screen record entire coding process (too slow, boring content). Instead:

Code in 2-hour chunks
After each chunk: film 5-min recap of what you learned
Show interesting parts: agent loop logic, bugs hit, key decisions
Use voiceover + code snippets, not live coding
What to Track While Building
Jot down as you code:

What was surprisingly easy/hard
Bugs you hit and how you solved them
"Aha" moments about agent behavior
Things that annoyed you about the tools
Comparisons between approaches
This becomes your video script.
