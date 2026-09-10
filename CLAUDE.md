# CLAUDE.md

## Colour

Colour does two jobs and only two. Anything else is decoration and does not belong.

**1. Status** says how something is doing. Green good, yellow needs attention,
red work on immediately. Comes only from `lib/severity.ts`.

**2. Identity** says which thing it is, and nothing about quality. Comes only
from the `IDENTITY` palette in `lib/theme.ts`, via `platformColor`,
`formatColor` or `tagColor`.

The two never collide, and that was measured rather than assumed.

### Base palette

- Page and card background: `#FFFFFF`
- Card border: `1px solid #D0D0D0`
- Primary text: `#111111`
- Secondary text: `#555555`
- Neutral boxes, insets, table headers: `#F2F2F2`
- Primary buttons: background `#111111`, text `#FFFFFF`

Depth comes from a hairline border plus the neutral shadow in `lib/theme.ts`.

### The identity palette

Six hues, fixed order, in `lib/theme.ts`:

| Slot | Hex |
|---|---|
| magenta | `#E8479C` |
| blue | `#1877F2` |
| orange | `#E8710A` |
| purple | `#833AB4` |
| teal | `#1A9AA3` |
| lime | `#65A30D` |

**The order is load bearing, not decorative.** Reordering breaks the CVD
adjacency check: magenta beside teal fails at 5.1 delta-E under deuteranopia,
which is why magenta is first and teal is last.

Assignments: platforms use purple, blue, teal. Formats use magenta, orange,
lime. Tags use the palette in order. A hue can mean Instagram on one page and
Reel on another, because platforms, formats and tags never share a chart and
every mark carries its own text label.

### Before adding or changing a hue, run the validator

```
node <dataviz-skill>/scripts/validate_palette.js "#hex,#hex,..." --mode light
```

It checks the lightness band, chroma floor, CVD separation, normal-vision floor
and contrast. Do not eyeball it. Also check every new hue against the three
status colours with `--pairs all`: nothing may fall below the normal-vision
floor of 15, or an identity mark becomes confusable with a status state.

Already rejected, with numbers, so they are not re-litigated:

| Hex | Why |
|---|---|
| `#C2185B` `#A81A5B` `#DB2777` | too close to status red (8.2, 7.8, 6.7) |
| `#E1306C` | Instagram's own magenta, 14.2 from status red |
| `#5B7C0A` | too close to status green (9.3) |
| `#C2410C` | too close to status red (9.1) |
| `#0891B2` `#7E22CE` | too close to teal and purple (4.1, 5.5) |
| `#00695C` `#69C9D0` | below the chroma floor, read as grey |
| `#FF0000` | YouTube brand red, collides with status red |

### Rules that still hold

1. **Colour never travels alone.** Every status ships with a text label, via
   `StatusBadge` or `StatusDot`. Every coloured bar and slice is directly
   labelled. Red and green are indistinguishable to a large share of readers.
2. **Every threshold lives in `lib/status.ts`.** Never hardcode a comparison.
3. **No status below the minimum sample.** `lib/status.ts` returns null rather
   than a colour when there is too little data.
4. **Two label scales, one colour scale.** ACTION (Good / Needs attention /
   Work on immediately) for things still changeable. PERFORMANCE (High / Medium
   / Low) for things already published. Set both `label` and `shortLabel`:
   compact badges read the short one.

### Known and accepted

The status green `#0A6B1F` and amber `#8A5A00` are 1.2 delta-E apart under
protanopia, effectively identical. Survivable only because every badge carries
a text label. Worth fixing if the palette is ever revisited.

## Charts

- Magnitude comes from bar length or arc size, never from colour. Identity
  comes from the label first and the hue second, so a chart still reads with
  the colour removed.
- A donut is only for a genuine part-to-whole question, capped at five slices
  with the rest folded into Other. Beyond that, arcs stop being comparable and
  a bar list is the honest form.
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
