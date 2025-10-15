'use client';

import { useState, useEffect } from 'react';

interface SentimentResult {
  commentId: string;
  postId: string;
  subreddit?: string;
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
  score?: number;
  model?: string;
  analyzedAt: number;
}

export default function Dashboard() {
  const [data, setData] = useState<SentimentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [subredditFilter, setSubredditFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'time' | 'upvotes'>('upvotes');
  const [quoteWorthyFilter, setQuoteWorthyFilter] = useState<boolean>(true);
  const [ignoredComments, setIgnoredComments] = useState<Set<string>>(new Set());
  const [ignoredThreads, setIgnoredThreads] = useState<Set<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState<boolean>(false);
  const [adminMode, setAdminMode] = useState<boolean>(false);
  const [weightByUpvotes, setWeightByUpvotes] = useState<boolean>(false);
  const [themeFilter, setThemeFilter] = useState<string>('all');

  // Check if running locally (admin mode)
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    setAdminMode(isLocal);
  }, []);

  // Load ignored comments from localStorage on mount
  useEffect(() => {
    const storedComments = localStorage.getItem('ignoredComments');
    if (storedComments) {
      setIgnoredComments(new Set(JSON.parse(storedComments)));
    }
    const storedThreads = localStorage.getItem('ignoredThreads');
    if (storedThreads) {
      setIgnoredThreads(new Set(JSON.parse(storedThreads)));
    }
  }, []);

  // Save ignored comments to localStorage when changed
  useEffect(() => {
    if (ignoredComments.size > 0) {
      localStorage.setItem('ignoredComments', JSON.stringify(Array.from(ignoredComments)));
    }
  }, [ignoredComments]);

  // Save ignored threads to localStorage when changed
  useEffect(() => {
    if (ignoredThreads.size > 0) {
      localStorage.setItem('ignoredThreads', JSON.stringify(Array.from(ignoredThreads)));
    }
  }, [ignoredThreads]);

  useEffect(() => {
    fetch('/sentiment_analysis.jsonl')
      .then(res => res.text())
      .then(text => {
        const lines = text.split('\n').filter(l => l.trim());
        const results = lines.map(line => JSON.parse(line));
        setData(results);
        setLoading(false);
      });
  }, []);

  // Helper: Map comparison to preference for filtering
  const getPreference = (comparison: string): 'claude_code' | 'codex' | 'neutral' | 'unclear' => {
    if (comparison === 'codex_better' || comparison === 'codex_only_positive' || comparison === 'codex_only_negative') return 'codex';
    if (comparison === 'claude_code_better' || comparison === 'claude_code_only_positive' || comparison === 'claude_code_only_negative') return 'claude_code';
    if (comparison === 'equal') return 'neutral';
    return 'unclear'; // off_topic, neither, etc.
  };

  // Toggle ignored status for comment
  const toggleIgnored = (commentId: string) => {
    setIgnoredComments(prev => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  // Toggle ignored status for entire thread
  const toggleThreadIgnored = (postId: string) => {
    setIgnoredThreads(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl">Loading sentiment analysis...</div>
      </div>
    );
  }

  // Filter out ignored comments and threads (unless showing ignored)
  const activeData = showIgnored
    ? data
    : data.filter(d => !ignoredComments.has(d.commentId) && !ignoredThreads.has(d.postId));

  // Subreddit aggregation (from active data only)
  const subredditCount: Record<string, number> = {};
  activeData.forEach(d => {
    const subredditName = d.subreddit || 'unknown';
    subredditCount[subredditName] = (subredditCount[subredditName] || 0) + 1;
  });
  const subreddits = Object.entries(subredditCount)
    .sort((a, b) => b[1] - a[1]); // Sort by count

  // Filter by subreddit first
  const subredditFilteredData = subredditFilter === 'all'
    ? activeData
    : activeData.filter(d => d.subreddit === subredditFilter);

  // Apply theme filter to subreddit-filtered data (for stats)
  const themeFilteredData = themeFilter === 'all'
    ? subredditFilteredData
    : subredditFilteredData.filter(d => d.themes.includes(themeFilter));

  // Calculate stats from theme-filtered data (by comparison type)
  const total = themeFilteredData.length;
  const claudeCodeBetter = themeFilteredData.filter(d => d.comparison === 'claude_code_better').length;
  const codexBetter = themeFilteredData.filter(d => d.comparison === 'codex_better').length;
  const equal = themeFilteredData.filter(d => d.comparison === 'equal').length;
  const claudeCodeOnlyPositive = themeFilteredData.filter(d => d.comparison === 'claude_code_only_positive').length;
  const claudeCodeOnlyNegative = themeFilteredData.filter(d => d.comparison === 'claude_code_only_negative').length;
  const codexOnlyPositive = themeFilteredData.filter(d => d.comparison === 'codex_only_positive').length;
  const codexOnlyNegative = themeFilteredData.filter(d => d.comparison === 'codex_only_negative').length;
  const neither = themeFilteredData.filter(d => d.comparison === 'neither').length;
  const offTopic = themeFilteredData.filter(d => d.comparison === 'off_topic').length;
  const quoteWorthy = themeFilteredData.filter(d => d.quoteWorthy).length;

  // Grouped stats for legacy filter compatibility
  const preferClaudeCode = claudeCodeBetter + claudeCodeOnlyPositive + claudeCodeOnlyNegative;
  const preferCodex = codexBetter + codexOnlyPositive + codexOnlyNegative;
  const neutral = equal;
  const unclear = neither + offTopic;

  // Calculate labeled-only stats (excluding neutral/unclear)
  const totalLabeled = preferClaudeCode + preferCodex;
  const claudeCodePctLabeled = totalLabeled > 0 ? (preferClaudeCode / totalLabeled) * 100 : 0;
  const codexPctLabeled = totalLabeled > 0 ? (preferCodex / totalLabeled) * 100 : 0;

  // Calculate weighted stats (by upvotes) from theme-filtered data
  const totalUpvotes = themeFilteredData.reduce((sum, d) => sum + (d.score || 0), 0);

  // Upvotes by specific comparison type
  const claudeCodeBetterUpvotes = themeFilteredData.filter(d => d.comparison === 'claude_code_better').reduce((sum, d) => sum + (d.score || 0), 0);
  const codexBetterUpvotes = themeFilteredData.filter(d => d.comparison === 'codex_better').reduce((sum, d) => sum + (d.score || 0), 0);
  const equalUpvotes = themeFilteredData.filter(d => d.comparison === 'equal').reduce((sum, d) => sum + (d.score || 0), 0);
  const claudeCodeOnlyPositiveUpvotes = themeFilteredData.filter(d => d.comparison === 'claude_code_only_positive').reduce((sum, d) => sum + (d.score || 0), 0);
  const claudeCodeOnlyNegativeUpvotes = themeFilteredData.filter(d => d.comparison === 'claude_code_only_negative').reduce((sum, d) => sum + (d.score || 0), 0);
  const codexOnlyPositiveUpvotes = themeFilteredData.filter(d => d.comparison === 'codex_only_positive').reduce((sum, d) => sum + (d.score || 0), 0);
  const codexOnlyNegativeUpvotes = themeFilteredData.filter(d => d.comparison === 'codex_only_negative').reduce((sum, d) => sum + (d.score || 0), 0);
  const neitherUpvotes = themeFilteredData.filter(d => d.comparison === 'neither').reduce((sum, d) => sum + (d.score || 0), 0);
  const offTopicUpvotes = themeFilteredData.filter(d => d.comparison === 'off_topic').reduce((sum, d) => sum + (d.score || 0), 0);

  // Grouped upvotes for legacy compatibility
  const claudeCodeUpvotes = claudeCodeBetterUpvotes + claudeCodeOnlyPositiveUpvotes + claudeCodeOnlyNegativeUpvotes;
  const codexUpvotes = codexBetterUpvotes + codexOnlyPositiveUpvotes + codexOnlyNegativeUpvotes;
  const neutralUpvotes = equalUpvotes;
  const unclearUpvotes = neitherUpvotes + offTopicUpvotes;

  // Model aggregation (from theme-filtered data)
  const modelCount: Record<string, number> = {};
  themeFilteredData.forEach(d => {
    const modelName = d.model || 'unknown';
    modelCount[modelName] = (modelCount[modelName] || 0) + 1;
  });
  const models = Object.keys(modelCount);

  // Theme aggregation (from subreddit-filtered data, NOT theme-filtered - we want to show all available themes)
  const themeCount: Record<string, number> = {};
  subredditFilteredData.forEach(d => {
    d.themes.forEach(theme => {
      themeCount[theme] = (themeCount[theme] || 0) + 1;
    });
  });
  const topThemes = Object.entries(themeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Filter data (subreddit and theme already applied above)
  let filteredData = themeFilteredData.filter(d => {
    // Comparison filter - support both legacy grouped filters and specific comparison types
    if (filter !== 'all') {
      // Legacy grouped filters
      if (filter === 'claude_code') {
        const isClaudeCode = d.comparison === 'claude_code_better'
          || d.comparison === 'claude_code_only_positive'
          || d.comparison === 'claude_code_only_negative';
        if (!isClaudeCode) return false;
      } else if (filter === 'codex') {
        const isCodex = d.comparison === 'codex_better'
          || d.comparison === 'codex_only_positive'
          || d.comparison === 'codex_only_negative';
        if (!isCodex) return false;
      } else if (filter === 'neutral') {
        if (d.comparison !== 'equal') return false;
      } else if (filter === 'unclear') {
        const isUnclear = d.comparison === 'neither' || d.comparison === 'off_topic';
        if (!isUnclear) return false;
      } else {
        // Specific comparison type filter
        if (d.comparison !== filter) return false;
      }
    }

    // Model filter
    if (modelFilter !== 'all' && d.model !== modelFilter) return false;

    // Quote-worthy filter
    if (quoteWorthyFilter && !d.quoteWorthy) return false;

    return true;
  });

  // Sort data
  if (sortBy === 'upvotes') {
    filteredData = [...filteredData].sort((a, b) => (b.score || 0) - (a.score || 0));
  } else {
    filteredData = [...filteredData].sort((a, b) => b.analyzedAt - a.analyzedAt);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Claude Code vs Codex Sentiment Analysis</h1>
            <p className="text-gray-600">
              Analysis of {data.length} Reddit comments
              {(ignoredComments.size > 0 || ignoredThreads.size > 0) && (
                <span className="text-orange-600 ml-2">
                  ({ignoredComments.size} comments + {ignoredThreads.size} threads ignored)
                </span>
              )}
            </p>
            {adminMode && (
              <p className="text-xs text-purple-600 mt-1">
                🔧 Admin Mode: Running locally
              </p>
            )}
          </div>
          {adminMode && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowIgnored(!showIgnored)}
                className={`px-4 py-2 rounded text-sm ${showIgnored ? 'bg-orange-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
                title={showIgnored ? 'Hide ignored comments' : 'Show ignored comments'}
              >
                {showIgnored ? '👁️ Showing Ignored' : '👁️‍🗨️ Hiding Ignored'} ({ignoredComments.size + ignoredThreads.size})
              </button>
            </div>
          )}
        </div>

        {/* Subreddit Filter */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4">Filter by Subreddit</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {subreddits.map(([subreddit, count]) => (
              <div key={subreddit} className="px-3 py-1 bg-orange-100 rounded-full text-sm">
                r/{subreddit} <span className="text-gray-500">({count})</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSubredditFilter('all')}
              className={`px-4 py-2 rounded ${subredditFilter === 'all' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              All Subreddits ({data.length})
            </button>
            {subreddits.map(([subreddit, count]) => (
              <button
                key={subreddit}
                onClick={() => setSubredditFilter(subreddit)}
                className={`px-4 py-2 rounded ${subredditFilter === subreddit ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                r/{subreddit} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Top Themes */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4">Filter by Discussion Theme</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {topThemes.map(([theme, count]) => (
              <div key={theme} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                {theme} <span className="text-gray-500">({count})</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setThemeFilter('all')}
              className={`px-3 py-1.5 text-sm rounded ${themeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300'}`}
            >
              All Themes
            </button>
            {topThemes.map(([theme, count]) => (
              <button
                key={theme}
                onClick={() => setThemeFilter(theme)}
                className={`px-3 py-1.5 text-sm rounded ${themeFilter === theme ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'}`}
              >
                {theme} ({count})
              </button>
            ))}
          </div>
        </div>

        {/* Comparison Breakdown */}
        <div className="bg-white p-6 rounded-lg shadow mb-4">
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold">Comparison Breakdown</h2>
              <p className="text-sm text-gray-600">
                {subredditFilter === 'all'
                  ? `${total} total comments analyzed`
                  : `${total} comments from r/${subredditFilter}`}
                {themeFilter !== 'all' && (
                  <span className="text-indigo-600 font-medium"> discussing "{themeFilter}"</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={weightByUpvotes}
                  onChange={(e) => setWeightByUpvotes(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Weight by upvotes</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-3xl font-bold text-blue-700">
                {weightByUpvotes ? claudeCodeBetterUpvotes.toLocaleString() : claudeCodeBetter}
              </div>
              <div className="text-xs font-medium text-gray-700">CC &gt; Codex</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((claudeCodeBetterUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((claudeCodeBetter / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-3xl font-bold text-green-700">
                {weightByUpvotes ? codexBetterUpvotes.toLocaleString() : codexBetter}
              </div>
              <div className="text-xs font-medium text-gray-700">Codex &gt; CC</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((codexBetterUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((codexBetter / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-purple-50 p-3 rounded">
              <div className="text-3xl font-bold text-purple-700">
                {weightByUpvotes ? equalUpvotes.toLocaleString() : equal}
              </div>
              <div className="text-xs font-medium text-gray-700">Equal</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((equalUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((equal / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-sky-50 p-3 rounded border-2 border-sky-200">
              <div className="text-3xl font-bold text-sky-700">
                {weightByUpvotes ? claudeCodeOnlyPositiveUpvotes.toLocaleString() : claudeCodeOnlyPositive}
              </div>
              <div className="text-xs font-medium text-gray-700">👍 CC Only</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((claudeCodeOnlyPositiveUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((claudeCodeOnlyPositive / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-sky-50 p-3 rounded border-2 border-red-200">
              <div className="text-3xl font-bold text-sky-700">
                {weightByUpvotes ? claudeCodeOnlyNegativeUpvotes.toLocaleString() : claudeCodeOnlyNegative}
              </div>
              <div className="text-xs font-medium text-gray-700">👎 CC Only</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((claudeCodeOnlyNegativeUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((claudeCodeOnlyNegative / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-teal-50 p-3 rounded border-2 border-teal-200">
              <div className="text-3xl font-bold text-teal-700">
                {weightByUpvotes ? codexOnlyPositiveUpvotes.toLocaleString() : codexOnlyPositive}
              </div>
              <div className="text-xs font-medium text-gray-700">👍 Codex Only</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((codexOnlyPositiveUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((codexOnlyPositive / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-teal-50 p-3 rounded border-2 border-red-200">
              <div className="text-3xl font-bold text-teal-700">
                {weightByUpvotes ? codexOnlyNegativeUpvotes.toLocaleString() : codexOnlyNegative}
              </div>
              <div className="text-xs font-medium text-gray-700">👎 Codex Only</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((codexOnlyNegativeUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((codexOnlyNegative / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-3xl font-bold text-gray-600">
                {weightByUpvotes ? neitherUpvotes.toLocaleString() : neither}
              </div>
              <div className="text-xs font-medium text-gray-700">Neither</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((neitherUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((neither / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
            <div className="bg-red-50 p-3 rounded">
              <div className="text-3xl font-bold text-red-600">
                {weightByUpvotes ? offTopicUpvotes.toLocaleString() : offTopic}
              </div>
              <div className="text-xs font-medium text-gray-700">Off-Topic</div>
              <div className="text-xs text-gray-500">
                {weightByUpvotes
                  ? `${totalUpvotes > 0 ? ((offTopicUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`
                  : `${total > 0 ? ((offTopic / total) * 100).toFixed(1) : 0}%`}
              </div>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-4 h-4 flex rounded-full overflow-hidden">
            <div
              className="bg-blue-700"
              style={{width: `${total > 0 ? (claudeCodeBetter / total) * 100 : 0}%`}}
              title={`Claude Code > Codex: ${claudeCodeBetter}`}
            />
            <div
              className="bg-green-700"
              style={{width: `${total > 0 ? (codexBetter / total) * 100 : 0}%`}}
              title={`Codex > Claude Code: ${codexBetter}`}
            />
            <div
              className="bg-purple-700"
              style={{width: `${total > 0 ? (equal / total) * 100 : 0}%`}}
              title={`Equal: ${equal}`}
            />
            <div
              className="bg-sky-600"
              style={{width: `${total > 0 ? (claudeCodeOnlyPositive / total) * 100 : 0}%`}}
              title={`👍 Claude Code Only: ${claudeCodeOnlyPositive}`}
            />
            <div
              className="bg-sky-800"
              style={{width: `${total > 0 ? (claudeCodeOnlyNegative / total) * 100 : 0}%`}}
              title={`👎 Claude Code Only: ${claudeCodeOnlyNegative}`}
            />
            <div
              className="bg-teal-600"
              style={{width: `${total > 0 ? (codexOnlyPositive / total) * 100 : 0}%`}}
              title={`👍 Codex Only: ${codexOnlyPositive}`}
            />
            <div
              className="bg-teal-800"
              style={{width: `${total > 0 ? (codexOnlyNegative / total) * 100 : 0}%`}}
              title={`👎 Codex Only: ${codexOnlyNegative}`}
            />
            <div
              className="bg-gray-500"
              style={{width: `${total > 0 ? (neither / total) * 100 : 0}%`}}
              title={`Neither: ${neither}`}
            />
            <div
              className="bg-red-500"
              style={{width: `${total > 0 ? (offTopic / total) * 100 : 0}%`}}
              title={`Off-Topic: ${offTopic}`}
            />
          </div>
        </div>

        {/* Labeled Comments Only (excluding neutral/unclear) */}
        <div className="bg-blue-50 border-2 border-blue-200 p-6 rounded-lg shadow mb-4">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-blue-900">Among Comments with Clear Preference</h2>
            <p className="text-sm text-gray-700">
              {weightByUpvotes
                ? `${(claudeCodeUpvotes + codexUpvotes).toLocaleString()} total upvotes on comments expressing clear preference`
                : `${totalLabeled} comments expressing clear preference (excluding ${neutral + unclear} neutral/unclear)`}
              {themeFilter !== 'all' && (
                <span className="text-indigo-600 font-medium"> discussing "{themeFilter}"</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-5xl font-bold text-blue-700">
                {weightByUpvotes
                  ? `${((claudeCodeUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100).toFixed(1)}%`
                  : `${claudeCodePctLabeled.toFixed(1)}%`}
              </div>
              <div className="text-sm font-medium text-gray-800">Prefer Claude Code</div>
              <div className="text-xs text-gray-600">
                {weightByUpvotes
                  ? `${claudeCodeUpvotes.toLocaleString()} of ${(claudeCodeUpvotes + codexUpvotes).toLocaleString()} upvotes`
                  : `${preferClaudeCode} of ${totalLabeled} labeled comments`}
              </div>
            </div>
            <div>
              <div className="text-5xl font-bold text-green-700">
                {weightByUpvotes
                  ? `${((codexUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100).toFixed(1)}%`
                  : `${codexPctLabeled.toFixed(1)}%`}
              </div>
              <div className="text-sm font-medium text-gray-800">Prefer Codex</div>
              <div className="text-xs text-gray-600">
                {weightByUpvotes
                  ? `${codexUpvotes.toLocaleString()} of ${(claudeCodeUpvotes + codexUpvotes).toLocaleString()} upvotes`
                  : `${preferCodex} of ${totalLabeled} labeled comments`}
              </div>
            </div>
          </div>

          {/* Visual bar showing split */}
          <div className="mt-4 h-4 flex rounded-full overflow-hidden">
            <div
              className="bg-blue-700"
              style={{width: weightByUpvotes
                ? `${((claudeCodeUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100)}%`
                : `${claudeCodePctLabeled}%`}}
              title={weightByUpvotes
                ? `Claude Code: ${((claudeCodeUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100).toFixed(1)}%`
                : `Claude Code: ${claudeCodePctLabeled.toFixed(1)}%`}
            />
            <div
              className="bg-green-700"
              style={{width: weightByUpvotes
                ? `${((codexUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100)}%`
                : `${codexPctLabeled}%`}}
              title={weightByUpvotes
                ? `Codex: ${((codexUpvotes / (claudeCodeUpvotes + codexUpvotes)) * 100).toFixed(1)}%`
                : `Codex: ${codexPctLabeled.toFixed(1)}%`}
            />
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600">{quoteWorthy}</div>
            <div className="text-sm text-gray-600">Quote-worthy comments</div>
            <div className="text-xs text-gray-400">{((quoteWorthy / total) * 100).toFixed(1)}% have substantive quotes</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-indigo-600">{totalUpvotes.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Total upvotes</div>
            <div className="text-xs text-gray-400">Average: {(totalUpvotes / total).toFixed(1)} per comment</div>
          </div>
        </div>

        {/* Weighted Stats (by upvotes) */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold">Weighted by Upvotes</h2>
            <p className="text-sm text-gray-600">
              {totalUpvotes.toLocaleString()} total upvotes across all comments
              {themeFilter !== 'all' && (
                <span className="text-indigo-600 font-medium"> discussing "{themeFilter}"</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-4xl font-bold text-blue-600">{totalUpvotes > 0 ? ((claudeCodeUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%</div>
              <div className="text-sm font-medium text-gray-700">Claude Code upvotes</div>
              <div className="text-xs text-gray-500">{claudeCodeUpvotes.toLocaleString()} upvotes</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-600">{totalUpvotes > 0 ? ((codexUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%</div>
              <div className="text-sm font-medium text-gray-700">Codex upvotes</div>
              <div className="text-xs text-gray-500">{codexUpvotes.toLocaleString()} upvotes</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-600">{totalUpvotes > 0 ? ((neutralUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%</div>
              <div className="text-sm font-medium text-gray-700">Neutral upvotes</div>
              <div className="text-xs text-gray-500">{neutralUpvotes.toLocaleString()} upvotes</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-400">{totalUpvotes > 0 ? ((unclearUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%</div>
              <div className="text-sm font-medium text-gray-700">Unclear upvotes</div>
              <div className="text-xs text-gray-500">{unclearUpvotes.toLocaleString()} upvotes</div>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-4 h-3 flex rounded-full overflow-hidden">
            <div
              className="bg-blue-600"
              style={{width: `${totalUpvotes > 0 ? (claudeCodeUpvotes / totalUpvotes) * 100 : 0}%`}}
              title={`Claude Code: ${totalUpvotes > 0 ? ((claudeCodeUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`}
            />
            <div
              className="bg-green-600"
              style={{width: `${totalUpvotes > 0 ? (codexUpvotes / totalUpvotes) * 100 : 0}%`}}
              title={`Codex: ${totalUpvotes > 0 ? ((codexUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`}
            />
            <div
              className="bg-gray-600"
              style={{width: `${totalUpvotes > 0 ? (neutralUpvotes / totalUpvotes) * 100 : 0}%`}}
              title={`Neutral: ${totalUpvotes > 0 ? ((neutralUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`}
            />
            <div
              className="bg-gray-400"
              style={{width: `${totalUpvotes > 0 ? (unclearUpvotes / totalUpvotes) * 100 : 0}%`}}
              title={`Unclear: ${totalUpvotes > 0 ? ((unclearUpvotes / totalUpvotes) * 100).toFixed(1) : 0}%`}
            />
          </div>
        </div>

        {/* Models Used */}
        {models.length > 1 && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-bold mb-4">Analysis Models</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(modelCount).map(([model, count]) => (
                <div key={model} className="px-3 py-1 bg-blue-100 rounded-full text-sm">
                  {model.replace('claude-3-5-', '').replace('-20241022', '')} <span className="text-gray-500">({count})</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModelFilter('all')}
                className={`px-3 py-1 text-sm rounded ${modelFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                All Models
              </button>
              {models.map(model => (
                <button
                  key={model}
                  onClick={() => setModelFilter(model)}
                  className={`px-3 py-1 text-sm rounded ${modelFilter === model ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {model.replace('claude-3-5-', '').replace('-20241022', '')}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort Controls */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Sort by:</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('time')}
              className={`px-4 py-2 rounded ${sortBy === 'time' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
            >
              Time (newest first)
            </button>
            <button
              onClick={() => setSortBy('upvotes')}
              className={`px-4 py-2 rounded ${sortBy === 'upvotes' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'}`}
            >
              Upvotes (highest first)
            </button>
          </div>
        </div>

        {/* Quote-worthy Filter */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Quality Filter:</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={quoteWorthyFilter}
              onChange={(e) => setQuoteWorthyFilter(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded"
            />
            <span className="text-sm">Only show quote-worthy comments (substantive comparisons)</span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            {quoteWorthyFilter ? `Showing ${filteredData.length} quote-worthy comments` : `Showing all ${filteredData.length} comments (including brief/unclear)`}
          </p>
        </div>

        {/* Active Theme Filter Indicator */}
        {themeFilter !== 'all' && (
          <div className="mb-6 p-4 bg-indigo-50 border-2 border-indigo-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-indigo-900">Theme Filter Active</h3>
                <p className="text-sm text-indigo-700">
                  Showing comments discussing: <span className="font-bold">{themeFilter}</span>
                </p>
              </div>
              <button
                onClick={() => setThemeFilter('all')}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
              >
                Clear Filter
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Filter by Comparison Type:</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}
            >
              All ({total})
            </button>
            <button
              onClick={() => setFilter('claude_code_better')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'claude_code_better' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}
            >
              🏆 CC &gt; Codex ({claudeCodeBetter})
            </button>
            <button
              onClick={() => setFilter('codex_better')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'codex_better' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 border border-green-200'}`}
            >
              🏆 Codex &gt; CC ({codexBetter})
            </button>
            <button
              onClick={() => setFilter('equal')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'equal' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 border border-purple-200'}`}
            >
              ⚖️ Equal ({equal})
            </button>
            <button
              onClick={() => setFilter('claude_code_only_positive')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'claude_code_only_positive' ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 border-2 border-sky-300'}`}
            >
              👍 CC Only ({claudeCodeOnlyPositive})
            </button>
            <button
              onClick={() => setFilter('claude_code_only_negative')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'claude_code_only_negative' ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 border-2 border-red-300'}`}
            >
              👎 CC Only ({claudeCodeOnlyNegative})
            </button>
            <button
              onClick={() => setFilter('codex_only_positive')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'codex_only_positive' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 border-2 border-teal-300'}`}
            >
              👍 Codex Only ({codexOnlyPositive})
            </button>
            <button
              onClick={() => setFilter('codex_only_negative')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'codex_only_negative' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-700 border-2 border-red-300'}`}
            >
              👎 Codex Only ({codexOnlyNegative})
            </button>
            <button
              onClick={() => setFilter('neither')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'neither' ? 'bg-gray-600 text-white' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}
            >
              ❌ Neither ({neither})
            </button>
            <button
              onClick={() => setFilter('off_topic')}
              className={`px-3 py-1.5 text-sm rounded ${filter === 'off_topic' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}
            >
              ⚠️ Off-Topic ({offTopic})
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div className="space-y-4">
          {filteredData.map((result) => {
            const isCommentIgnored = ignoredComments.has(result.commentId);
            const isThreadIgnored = ignoredThreads.has(result.postId);
            const isIgnored = isCommentIgnored || isThreadIgnored;

            // Get comparison badge styling
            const getComparisonBadge = () => {
              switch (result.comparison) {
                case 'claude_code_better':
                  return { bg: 'bg-blue-100', text: 'text-blue-700', label: '🏆 Claude Code > Codex' };
                case 'codex_better':
                  return { bg: 'bg-green-100', text: 'text-green-700', label: '🏆 Codex > Claude Code' };
                case 'equal':
                  return { bg: 'bg-purple-100', text: 'text-purple-700', label: '⚖️ Equal/Neutral' };
                case 'claude_code_only_positive':
                  return { bg: 'bg-sky-100', text: 'text-sky-700', label: '👍 Just Claude Code (Positive)' };
                case 'claude_code_only_negative':
                  return { bg: 'bg-sky-100 border-2 border-red-400', text: 'text-sky-700', label: '👎 Just Claude Code (Negative)' };
                case 'codex_only_positive':
                  return { bg: 'bg-teal-100', text: 'text-teal-700', label: '👍 Just Codex (Positive)' };
                case 'codex_only_negative':
                  return { bg: 'bg-teal-100 border-2 border-red-400', text: 'text-teal-700', label: '👎 Just Codex (Negative)' };
                case 'neither':
                  return { bg: 'bg-gray-100', text: 'text-gray-700', label: '❌ Neither Tool' };
                case 'off_topic':
                  return { bg: 'bg-red-100', text: 'text-red-700', label: '⚠️ Off-Topic' };
                default:
                  return { bg: 'bg-gray-100', text: 'text-gray-500', label: result.comparison };
              }
            };

            const badge = getComparisonBadge();

            return (
            <div key={result.commentId} className={`bg-white p-6 rounded-lg shadow ${isIgnored ? 'opacity-50 border-2 border-red-300' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex gap-2 flex-wrap items-center">
                  {result.subreddit && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">r/{result.subreddit}</span>
                  )}
                  {isThreadIgnored && (
                    <span className="px-2 py-1 bg-red-200 text-red-800 text-xs rounded font-bold">🚫 THREAD IGNORED</span>
                  )}
                  {isCommentIgnored && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-bold">🚫 COMMENT IGNORED</span>
                  )}
                  <span className={`px-3 py-1 ${badge.bg} ${badge.text} text-sm rounded font-medium`}>
                    {badge.label}
                  </span>
                  {result.quoteWorthy && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">⭐ Quote-worthy</span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {adminMode && (
                    <>
                      <button
                        onClick={() => toggleThreadIgnored(result.postId)}
                        className={`px-3 py-1 rounded text-xs font-medium ${isThreadIgnored ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                        title={isThreadIgnored ? 'Restore entire thread' : 'Ignore entire thread (all comments in this post)'}
                      >
                        {isThreadIgnored ? '✓ Restore Thread' : '🧵 Ignore Thread'}
                      </button>
                      <button
                        onClick={() => toggleIgnored(result.commentId)}
                        className={`px-3 py-1 rounded text-xs font-medium ${isCommentIgnored ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                        title={isCommentIgnored ? 'Restore this comment' : 'Ignore this comment (exclude from stats)'}
                      >
                        {isCommentIgnored ? '✓ Restore' : '✗ Ignore'}
                      </button>
                    </>
                  )}
                  <a
                    href={result.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm whitespace-nowrap"
                  >
                    View on Reddit →
                  </a>
                </div>
              </div>

              {result.quote && (
                <blockquote className="border-l-4 border-purple-500 pl-4 py-2 mb-3 italic text-gray-700">
                  "{result.quote}"
                </blockquote>
              )}

              <p className="text-gray-700 mb-3">{result.reasoning}</p>

              {result.themes.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {result.themes.map(theme => (
                    <span key={theme} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                      {theme}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-4 items-center text-xs text-gray-500">
                <span>Claude Code: {result.claudeCodeSentiment}</span>
                <span>Codex: {result.codexSentiment}</span>
                {result.score !== undefined && (
                  <span className="text-lg font-bold text-orange-600 px-2 py-1 bg-orange-50 rounded">
                    ↑ {result.score}
                  </span>
                )}
                {result.model && (
                  <span className="ml-auto text-gray-400">
                    {result.model.replace('claude-3-5-', '').replace('-20241022', '')}
                  </span>
                )}
              </div>
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}
