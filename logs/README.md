# Analysis Run Logs

This directory contains metadata about each analysis run.

## runs.jsonl

One JSON object per line (JSONL format), each representing a single `npm run analyze` execution:

```json
{
  "timestamp": 1697123456789,
  "model": "claude-3-5-haiku-20241022",
  "totalCandidates": 3686,
  "alreadyAnalyzed": 0,
  "analyzedThisRun": 50,
  "errors": 0,
  "timeSeconds": 45,
  "inputTokens": 125000,
  "outputTokens": 10000,
  "estimatedCost": 0.0625,
  "batchSize": 50
}
```

## Fields

- **timestamp**: Unix timestamp (milliseconds) when the run completed
- **model**: Which Claude model was used for analysis
- **totalCandidates**: Total comparative comments found (already analyzed + remaining)
- **alreadyAnalyzed**: How many comments were already analyzed before this run
- **analyzedThisRun**: How many comments were analyzed in this run
- **errors**: Number of comments that failed analysis
- **timeSeconds**: Total runtime in seconds
- **inputTokens**: Estimated input tokens used
- **outputTokens**: Estimated output tokens used
- **estimatedCost**: Estimated API cost in USD
- **batchSize**: Configured batch size for this run

## Use Cases

- Track total cost across all runs
- Compare Haiku vs Sonnet performance/cost
- Monitor error rates
- Estimate time remaining for full analysis
- Generate cost/performance reports for content
