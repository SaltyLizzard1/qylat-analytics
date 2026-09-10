# CLAUDE.md

## Colour

The base design is black and white. Colour carries exactly one meaning in this
project: status. Nothing is coloured for decoration, for branding, or to tell
one data series from another.

### Base palette

- Page and card background: `#FFFFFF`
- Card border: `1px solid #D0D0D0`
- Primary text: `#111111`
- Secondary text: `#555555`
- Neutral boxes, insets, table headers: `#F2F2F2`
- Primary buttons: background `#111111`, text `#FFFFFF`, border `1px solid #111111`

Depth comes from a hairline border plus the neutral shadow in `lib/theme.ts`,
never from a tinted background.

### Status colour

Three states, and only three:

| State | Meaning | Source |
|---|---|---|
| Green | Good, working, leave it alone | `severityGood` |
| Yellow | Needs attention | `severityWarning` |
| Red | Work on immediately | `severityBad` |

Rules:

1. **Status colour comes only from `lib/severity.ts`.** Never write a status
   colour inline. Never add a fourth state.
2. **Colour never travels alone.** Every status ships with a text label, via
   `StatusBadge` or `StatusDot` in `components/status.tsx`. Red and green are
   indistinguishable to a significant share of readers, and a greyscale print
   has to stay readable.
3. **Every threshold lives in `lib/status.ts`.** Do not hardcode a comparison
   anywhere else. Changing a number there moves every badge and the overview
   attention list together.
4. **No status below the minimum sample.** `lib/status.ts` returns null rather
   than a colour when there is too little data. Too few clicks is no data, not
   a problem, and colouring it red invents a finding.

### The warm tint rule, and its one exception

Do not use cream, gold, tan or any warm tint in the base design.

Forbidden values (not exhaustive): `#FBF6E3`, `#E8C84A`, `#8B6914`, `#2D1A00`,
`#1A1008`, `#231409`, `#3A2210`, `#0F0A05`, `#8A7A60`, `#E6DCC3`, `#F3ECD6`,
`#F9F4E8`, `#FFF8E1`, `#FFE082`, `#D4C4A0`, `#C9A030`, `#F5E070`, `#4A3820`,
`#5A4A30`, `#6A5A40`, `#3A281A`, `#92A882`.

The single exception is `severityWarning` in `lib/severity.ts`, which is a warm
amber on a pale warm ground. That is deliberate: yellow is the requested colour
for "needs attention" and there is no cool yellow. It is confined to that file
and to status use. Everywhere else the ban stands.

## Charts

- Identity comes from the label, magnitude from bar length. No categorical
  colour encoding, so there is no palette to validate.
- **One axis per chart.** Two measures of different scale become two charts,
  stacked and sharing an x axis. Never a second y axis.
- No track or rail behind a bar. An unfilled rail encodes nothing while looking
  like it encodes something, and reads as a second series.
- Label the first, last and peak point on a trend. Never every point.
- Grid and axis recede. Data does not.

## Typography

No Cormorant Garamond. No Google Fonts. `system-ui` everywhere.
Headings: font-weight 600, colour `#111111`, negative letter-spacing from
`lib/theme.ts`.

## No em dashes

Do not use em dashes in code, comments, or strings.

## Data facts that will bite you

These are not derivable from the code and have each caused a real failure.

- **There are two Neon databases.** Development is `ep-sweet-unit-aygqfu6j`
  (us-east-2) and is effectively empty. Production is `ep-small-mud-az5opu7m`
  (ap-southeast-1) and holds the real data. `vercel env pull` defaults to
  development, so a plain pull points you at the empty one. Use
  `--environment=production` for migrations and for any row count you intend to
  report, and say which database a number came from.
- **Use views, not reach.** Meta accepts `post_total_media_view_unique` for
  Facebook Page posts and returns 0 for every single one. Any cross-platform
  comparison built on reach shows Facebook as dead when it is not.
- **Meta retired impressions.** Instagram media created after 2024-07-02 report
  `views`. Facebook `post_impressions` became `post_media_view`.
- **Never discover the Page through `/me/accounts`.** It returns an empty array
  for this account because the Page sits inside a business portfolio. Address
  the Page directly by `META_PAGE_ID`.
- **A user token is not a Page token.** A user token reads Page fields and
  Instagram media fine, then fails `/{page-id}/posts` with OAuthException 190,
  subcode 2069032. Derive the Page token with
  `GET /<PAGE_ID>?fields=access_token`, or run `scripts/derive-page-token.mjs`.
- **`post_metrics` holds one snapshot per post per day.** Always read the
  latest snapshot per post. Never `SUM` across days, which looks correct while
  there is one snapshot and silently double counts from the second day onward.
- **GA4 revises recent days for up to 48 hours.** The sync re-reads a window and
  overwrites. Do not append yesterday once and trust it.
- **`utm_content` is `sessionManualAdContent`** in the GA4 Data API. Verified
  against the live property. `sessionAdContent` and `sessionContent` are both
  rejected. It carries the `/go/` slug, which is what joins a GA session to a
  link, a platform and a theme.
- **Manual audience rows are sacred.** `audience_snapshots` rows with
  `source = 'manual'` are the only record of the personal Facebook profile,
  which no API can read. Both sync upserts carry `WHERE source = 'api'`. Keep
  it that way.
- **Deleting a link with clicks fails.** `click_events.slug` is a foreign key to
  `links.slug` with no cascade rule. Known defect, not yet fixed.
