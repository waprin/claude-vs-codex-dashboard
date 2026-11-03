import Snoowrap from 'snoowrap';
import { config } from 'dotenv';

config();

const DEFAULT_USER_AGENT = 'lois-content-research/1.0.0';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

/**
 * Request a "user-less" access token with the client_credentials grant.
 *
 * `ctx` must carry userAgent/clientId/clientSecret: snoowrap's
 * credentialedClientRequest reads all three from `this`. (snoowrap's own
 * fromApplicationOnlyAuth omits userAgent from that context, so the token
 * request goes out without a User-Agent header and Reddit answers 403.)
 */
async function requestClientCredentialsToken(ctx: {
  userAgent: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const tokenInfo: TokenResponse = await Snoowrap.prototype.credentialedClientRequest.call(ctx, {
    method: 'post',
    baseUrl: 'https://www.reddit.com/',
    uri: 'api/v1/access_token',
    form: { grant_type: 'client_credentials' },
  });

  if (tokenInfo.error) {
    throw new Error(
      `Reddit token request failed: ${tokenInfo.error}${
        tokenInfo.error_description ? ` - ${tokenInfo.error_description}` : ''
      }`
    );
  }
  return tokenInfo;
}

/**
 * Snoowrap only refreshes an expired token when it has a refresh token or a
 * username/password. With the client_credentials grant we instead ask Reddit
 * for a fresh token from the app's own credentials, so long-running scrapes
 * keep working past the one-hour token lifetime.
 */
class AppOnlySnoowrap extends Snoowrap {
  async updateAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiration) {
      return this.accessToken;
    }
    const tokenInfo = await requestClientCredentialsToken({
      userAgent: this.userAgent,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
    this.accessToken = tokenInfo.access_token;
    this.tokenExpiration = Date.now() + tokenInfo.expires_in * 1000;
    this.scope = tokenInfo.scope.split(' ');
    return this.accessToken;
  }
}

/**
 * Create a read-only Reddit client authenticated with just the app's
 * client ID and secret. No Reddit username or password is needed; public
 * subreddits, posts and comments are all this project reads.
 *
 * Env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, optional REDDIT_USER_AGENT.
 */
export async function createRedditClient(): Promise<Snoowrap> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || DEFAULT_USER_AGENT;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Reddit credentials: set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env'
    );
  }

  const tokenInfo = await requestClientCredentialsToken({ userAgent, clientId, clientSecret });

  const reddit = new AppOnlySnoowrap({
    userAgent,
    clientId,
    clientSecret,
    accessToken: tokenInfo.access_token,
  });
  reddit.tokenExpiration = Date.now() + tokenInfo.expires_in * 1000;
  reddit.scope = tokenInfo.scope.split(' ');
  return reddit;
}
