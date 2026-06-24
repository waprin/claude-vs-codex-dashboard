import { writeFileSync } from 'fs';
import { config } from 'dotenv';

config();

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN!;
const USERNAME = process.env.TWITTER_USERNAME || 'Bill_Prin';
const OUTPUT_FILE = 'twitter_data.jsonl';

interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  bookmarkCount: number;
  url: string;
  scrapedAt: number;
  isReply: boolean;
  inReplyToUserId?: string;
  inReplyToUsername?: string;
}

/**
 * Make authenticated request to Twitter API v2
 */
async function twitterFetch(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`https://api.twitter.com/2/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Twitter API error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Get user ID from username
 */
async function getUserId(username: string): Promise<string> {
  const data = await twitterFetch(`users/by/username/${username}`);
  if (!data.data) {
    throw new Error(`User not found: @${username}`);
  }
  return data.data.id;
}

/**
 * Get user's recent tweets with metrics
 */
async function getUserTweets(userId: string, maxResults: number = 10): Promise<Tweet[]> {
  const data = await twitterFetch(`users/${userId}/tweets`, {
    max_results: String(Math.min(maxResults, 100)),
    'tweet.fields': 'created_at,public_metrics,in_reply_to_user_id',
    'expansions': 'in_reply_to_user_id',
    'user.fields': 'username',
    exclude: 'retweets', // Include replies, exclude retweets
  });

  if (!data.data || data.data.length === 0) {
    console.log('No tweets found.');
    return [];
  }

  // Build user lookup for reply targets
  const users: Record<string, string> = {};
  if (data.includes?.users) {
    for (const user of data.includes.users) {
      users[user.id] = user.username;
    }
  }

  const tweets: Tweet[] = data.data.map((tweet: any) => ({
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at,
    likeCount: tweet.public_metrics?.like_count || 0,
    retweetCount: tweet.public_metrics?.retweet_count || 0,
    replyCount: tweet.public_metrics?.reply_count || 0,
    quoteCount: tweet.public_metrics?.quote_count || 0,
    impressionCount: tweet.public_metrics?.impression_count || 0,
    bookmarkCount: tweet.public_metrics?.bookmark_count || 0,
    url: `https://twitter.com/${USERNAME}/status/${tweet.id}`,
    scrapedAt: Date.now(),
    isReply: !!tweet.in_reply_to_user_id,
    inReplyToUserId: tweet.in_reply_to_user_id,
    inReplyToUsername: tweet.in_reply_to_user_id ? users[tweet.in_reply_to_user_id] : undefined,
  }));

  return tweets;
}

/**
 * Pretty print a tweet with analytics
 */
function printTweet(tweet: Tweet, index: number) {
  const date = new Date(tweet.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const replyTag = tweet.isReply ? `  [Reply to @${tweet.inReplyToUsername || 'unknown'}]` : '';
  console.log(`#${index + 1}  ${date}${replyTag}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n${tweet.text}\n`);
  console.log(`📊 Analytics:`);
  console.log(`   👁  Impressions: ${tweet.impressionCount.toLocaleString()}`);
  console.log(`   ♥  Likes:       ${tweet.likeCount.toLocaleString()}`);
  console.log(`   🔁 Retweets:    ${tweet.retweetCount.toLocaleString()}`);
  console.log(`   💬 Replies:     ${tweet.replyCount.toLocaleString()}`);
  console.log(`   🔖 Bookmarks:   ${tweet.bookmarkCount.toLocaleString()}`);
  console.log(`   📎 Quotes:      ${tweet.quoteCount.toLocaleString()}`);

  // Engagement rate (if impressions > 0)
  if (tweet.impressionCount > 0) {
    const engagements = tweet.likeCount + tweet.retweetCount + tweet.replyCount + tweet.bookmarkCount;
    const rate = ((engagements / tweet.impressionCount) * 100).toFixed(2);
    console.log(`   📈 Eng. Rate:   ${rate}%`);
  }

  console.log(`\n   🔗 ${tweet.url}`);
}

async function main() {
  if (!BEARER_TOKEN) {
    console.error('❌ TWITTER_BEARER_TOKEN not set in .env');
    process.exit(1);
  }

  console.log(`🐦 Fetching last 10 tweets for @${USERNAME}\n`);

  try {
    // Get user ID
    console.log(`Looking up @${USERNAME}...`);
    const userId = await getUserId(USERNAME);
    console.log(`Found user ID: ${userId}\n`);

    // Fetch tweets
    const tweets = await getUserTweets(userId, 10);

    if (tweets.length === 0) {
      console.log('No tweets found.');
      return;
    }

    // Print each tweet with analytics
    tweets.forEach((tweet, i) => printTweet(tweet, i));

    // Save to JSONL
    for (const tweet of tweets) {
      writeFileSync(OUTPUT_FILE, JSON.stringify(tweet) + '\n', { flag: 'a' });
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Fetched ${tweets.length} tweets`);
    console.log(`  Saved to: ${OUTPUT_FILE}`);

  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
  }
}

main().catch(console.error);
