/**
 * Derives the long-lived Page access token for the QYLAT Facebook Page.
 *
 * Why this exists: /me/accounts returns an empty array for this account,
 * because the Page sits inside a business portfolio. The Page must be
 * addressed directly by its ID, and its token derived with
 * GET /<PAGE_ID>?fields=access_token.
 *
 * A User token is NOT interchangeable with a Page token. A User token can read
 * the Page's public fields and the linked Instagram media, but /<PAGE_ID>/posts
 * and /<PAGE_ID>/feed reject it with OAuthException code 190, subcode 2069032.
 *
 * Usage:
 *   node scripts/derive-page-token.mjs
 *
 * Reads META_PAGE_ID and a user token from .env.local. The user token can be in
 * either META_USER_ACCESS_TOKEN or META_PAGE_ACCESS_TOKEN. Prints the derived
 * Page token on stdout and everything else on stderr, so you can capture just
 * the token:
 *
 *   node scripts/derive-page-token.mjs > token.txt
 *
 * Then paste it into Vercel:
 *   vercel env rm META_PAGE_ACCESS_TOKEN production --yes
 *   vercel env add META_PAGE_ACCESS_TOKEN production
 */

import { config } from 'dotenv';

// quiet is required. Without it dotenv prints a banner to stdout, which
// corrupts the token when this script's output is captured or redirected.
config({ path: '.env.local', override: true, quiet: true });

const VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const pageId = process.env.META_PAGE_ID;
const userToken = process.env.META_USER_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

if (!pageId) fail('META_PAGE_ID is not set in .env.local');
if (!userToken) fail('Set META_USER_ACCESS_TOKEN (or META_PAGE_ACCESS_TOKEN) in .env.local');

async function graph(path, params, token) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const response = await fetch(url.toString());
  const body = await response.json();
  if (body.error) {
    const e = body.error;
    fail(`${e.message} (code ${e.code}${e.error_subcode ? `, subcode ${e.error_subcode}` : ''})`);
  }
  return body;
}

const derived = await graph(pageId, { fields: 'access_token' }, userToken);
const pageToken = derived.access_token;
if (!pageToken) {
  fail(
    'No access_token was returned. The token you supplied is probably not a ' +
      'user token with pages_read_engagement, or you are not an admin of this Page.'
  );
}

// Prove it is actually a Page token before handing it over.
const who = await graph('me', { fields: 'id,name' }, pageToken);
if (who.id !== pageId) {
  fail(`Derived token belongs to "${who.name}" (${who.id}), not the Page (${pageId})`);
}

const posts = await graph(`${pageId}/posts`, { limit: '1', fields: 'id' }, pageToken);

console.error(`Page:        ${who.name} (${who.id})`);
console.error(`Token type:  PAGE, ${pageToken.length} chars`);
console.error(`Posts edge:  OK, ${posts.data?.length ?? 0} post(s) readable`);
console.error('');
console.error('Page token on stdout below. Paste it into Vercel, do not commit it.');
console.error('');

console.log(pageToken);
