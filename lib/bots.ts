/**
 * Which /go/ hits are not a person.
 *
 * Measured on production on 2026-09-19: 30 of 50 logged clicks came from
 * `facebookexternalhit`, the crawler Meta sends to build a link preview. With
 * those removed, clicks matched Google Analytics sessions on both platforms,
 * so the "traffic is not arriving" alerts had been false.
 *
 * Only agents that identify themselves are flagged. An odd browser version is
 * not evidence, so a stale Chrome build still counts as a person. The cost of
 * the generic `bot` token is a rare false positive on CUBOT branded phones,
 * accepted because nearly every crawler declares itself with that word.
 *
 * Flagged hits are still redirected, since a link preview needs the
 * destination, and still stored, since the log is the record of what happened.
 * They are excluded from every figure through the `human_clicks` view.
 *
 * The backfill in db/migrations/005_click_bot_flag.sql repeats this list in
 * SQL. It ran once, so later additions here do not need to go there, but they
 * do not reclassify old rows either.
 */
export const BOT_TOKENS: readonly string[] = [
  // Self declared crawlers of any kind.
  'bot',
  'crawler',
  'spider',
  // Link preview fetchers that do not use the word bot.
  'facebookexternalhit',
  'facebookcatalog',
  'meta-externalagent',
  'meta-externalfetcher',
  '^whatsapp/',
  'slack-imgproxy',
  'skypeuripreview',
  'embedly',
  'quora link preview',
  // AI assistants fetching a page on someone's behalf.
  'claude-user',
  'chatgpt-user',
  'perplexity-user',
  'anthropic-ai',
  // HTTP libraries and automation, which are never a person in a browser.
  'headlesschrome',
  'curl/',
  'wget/',
  'python-requests',
  'python-urllib',
  'go-http-client',
  'node-fetch',
  'axios/',
];

const BOT_PATTERN = new RegExp(`(${BOT_TOKENS.join('|')})`, 'i');

/**
 * True when the user agent is not a person. A missing user agent counts as a
 * bot, because every real browser sends one.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  if (ua === '') return true;
  return BOT_PATTERN.test(ua);
}
