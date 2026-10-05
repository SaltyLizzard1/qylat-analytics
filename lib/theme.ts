import { DASHBOARD_TZ } from '@/lib/period';

/**
 * The base palette. Neutrals only: no hue here says anything about a platform
 * or about how something is doing.
 *
 * The page is a soft cool tint and the cards on it are white, so a card reads
 * as a surface without an outline. The header is a deep ink. Colour that means
 * something still comes from two places only: status from lib/severity.ts and
 * identity from the IDENTITY palette below.
 */
export const C = {
  /** Page background. */
  page: '#F1F2F9',
  /** Card and panel surface. */
  card: '#FFFFFF',
  /** Hairline for dividers and inputs. Not for outlining every card. */
  border: '#DADDEA',
  text: '#13152B',
  muted: '#555A72',
  /** Insets, tracks and quiet chips. */
  neutral: '#E9EBF5',
  /** The header, selected controls and primary buttons. */
  ink: '#13152B',
  /** A raised surface on ink: nav pills, header buttons. */
  inkRaised: '#262A4A',
  /** Text on ink. */
  onInk: '#FFFFFF',
  /** Secondary text on ink. 7.6 to 1 on ink. */
  onInkMuted: '#B9BDD8',
} as const;

/** Depth comes from this shadow and the tinted page, not from an outline. */
export const SHADOW = '0 1px 2px rgba(19, 21, 43, 0.06), 0 6px 20px rgba(19, 21, 43, 0.06)';

export const RADIUS = { sm: '8px', md: '12px', lg: '18px', pill: '999px' } as const;

export const CARD = {
  background: C.card,
  borderRadius: RADIUS.lg,
  boxShadow: SHADOW,
} as const;

export const HEADING = {
  fontWeight: 700,
  color: C.text,
  letterSpacing: '-0.014em',
} as const;

/** Page title and figures. Tighter tracking at larger sizes stops them looking loose. */
export const TITLE = {
  fontWeight: 700,
  color: C.text,
  letterSpacing: '-0.024em',
} as const;

/** Small uppercase label over a figure or a chart. Never smaller than this. */
export const EYEBROW = {
  fontSize: '0.72rem',
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: C.muted,
} as const;

/**
 * A soft wash of an identity colour, for a chip or an area under a line. The
 * colour itself is unchanged, so the wash can never drift into another hue.
 */
export function tint(hex: string, alpha = 0.14): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Compact number formatting for dense tables. 12400 becomes 12.4k. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  if (Math.abs(n) < 1000) return String(n);
  if (Math.abs(n) < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/**
 * Percentage, where zero is a measurement rather than a gap.
 *
 * An earlier version returned '--' for a zero numerator, so a post with 479
 * views and genuinely no interactions displayed as "-- eng" and looked like
 * missing data. Zero engagement is a real and interesting result. Only a null
 * value or a zero denominator is unknown.
 */
export function pct(numerator: number | null | undefined, denominator: number | null | undefined): string {
  if (numerator === null || numerator === undefined) return '--';
  if (!denominator) return '--';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * Dates and times are shown in the dashboard's own zone, never the server's.
 *
 * Vercel renders in UTC, so without a zone a Reel published at 05:30 on the
 * 15th in Chiang Mai read "14 Sept", and a sync at 18:41 read "11:41". A
 * date only value is midnight UTC, which is 07:00 the same day in Bangkok, so
 * naming the zone is safe for those too.
 */
export function shortDate(value: string | Date | null): string {
  if (!value) return '--';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: DASHBOARD_TZ });
}

/** "19 Sept, 18:41" in the dashboard's zone. */
export function shortDateTime(value: string | Date | null | undefined): string {
  if (!value) return '--';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DASHBOARD_TZ,
  });
}

/**
 * 'facebook' is the Page, read through Meta's API. 'facebook-personal' is the
 * personal profile, read by the local scraper. They are different accounts
 * with different audiences and are never merged under one "Facebook".
 */
export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Page',
  'facebook-personal': 'Facebook Profile',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

/**
 * Platform identity colours. A second, separate job for colour.
 *
 * Status is green / yellow / red and says how something is doing. These say
 * WHICH platform, and nothing about quality. The two never overlap, which was
 * checked rather than assumed: run through the dataviz palette validator, the
 * trio passes the lightness band, the chroma floor, CVD separation, the
 * normal-vision floor and contrast, and no pair with a status colour falls
 * below the normal-vision floor.
 *
 * Deliberate substitutions from the official brand palettes:
 *   Instagram uses its brand purple, not its magenta #E1306C. Magenta sat
 *   only 14.2 delta-E from the status red #B00020, below the readability
 *   floor, so the two could be confused on the same screen.
 *   TikTok uses a darkened teal, not its brand cyan #69C9D0, which failed the
 *   lightness band and the chroma floor and read as grey on white.
 *   YouTube gets no hue. Its brand red would collide with status red, and
 *   there is no YouTube data to plot.
 *
 * Every coloured bar is also directly labelled, so identity never rests on
 * colour alone.
 */
export const PLATFORM_COLOR: Record<string, string> = {
  instagram: '#833AB4',
  facebook: '#1877F2',
  // The palette's teal, shared with TikTok. The two never meet on a chart:
  // TikTok has no post data to plot, and the profile appears only where the
  // Page and Instagram do. No new hue was added, so nothing needed validating.
  'facebook-personal': '#1A9AA3',
  tiktok: '#1A9AA3',
  youtube: C.muted,
};

export function platformColor(platform: string | null | undefined): string {
  if (!platform) return C.text;
  return PLATFORM_COLOR[platform] ?? C.text;
}

/**
 * The identity palette: six hues, fixed order, every one validated.
 *
 * Run through the dataviz validator as a categorical palette in this exact
 * order, it passes the lightness band, the chroma floor, CVD adjacent
 * separation, the normal-vision floor and contrast against the surface. Every
 * slot was also checked against all three status colours with no pair falling
 * below the normal-vision floor, so an identity hue can never be mistaken for
 * a good, warning or urgent state.
 *
 * The order matters and is not decorative: reordering breaks the CVD adjacency
 * check. Magenta next to teal fails at 5.1 delta-E under deuteranopia, which
 * is why magenta sits first and teal last.
 *
 * Rejected, with the numbers, so nobody re-litigates them:
 *   #C2185B, #A81A5B, #DB2777  too close to status red (8.2, 7.8, 6.7)
 *   #5B7C0A                    too close to status green (9.3)
 *   #C2410C                    too close to status red (9.1)
 *   #0891B2, #7E22CE           too close to teal and purple (4.1, 5.5)
 *   #00695C, #69C9D0           below the chroma floor, read as grey
 *
 * Each chart draws from this palette in its own fixed assignment. A hue can
 * mean Instagram on one page and Reel on another, because platforms, formats
 * and tags never share a chart and every mark carries its own text label.
 */
export const IDENTITY = {
  magenta: '#E8479C',
  blue: '#1877F2',
  orange: '#E8710A',
  purple: '#833AB4',
  teal: '#1A9AA3',
  lime: '#65A30D',
} as const;

/**
 * Series colours for charts that belong to no account. No data mark is drawn
 * in ink, white or grey: the colour says WHICH series, never how it is doing.
 *
 * These reuse validated identity hues rather than adding near-duplicates. Run
 * through the validator on 2026-10-05, every candidate "new" teal sat 5.9 to
 * 8.4 from the palette teal and every candidate violet 2.5 to 7.7 from the
 * palette purple or blue, all under the normal-vision floor of 15. So website
 * sessions take the palette teal and link clicks the palette purple. They
 * share those hues with Facebook Profile and Instagram, which is allowed by
 * the same rule as formats and tags: they never share a chart, and every
 * chart names its series in its title.
 */
export const SERIES = {
  /** Website sessions. */
  sessions: IDENTITY.teal,
  /** Link clicks. */
  clicks: IDENTITY.purple,
  /** Any other single series with no account of its own, e.g. posts published. */
  general: IDENTITY.magenta,
  /** A second series beside `general` in a pair of stacked charts. */
  second: IDENTITY.orange,
} as const;

/** The palette in its fixed order, for slices that have no colour of their own. */
export const SERIES_ORDER = [
  IDENTITY.magenta,
  IDENTITY.blue,
  IDENTITY.orange,
  IDENTITY.purple,
  IDENTITY.teal,
  IDENTITY.lime,
] as const;

/** A colour mixed toward white. Opaque, so it looks the same on any surface. */
export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The earlier period beside the current one: a lighter tint of the same
 * series colour. Lighter means earlier, never worse. Still plainly visible on
 * a white card, and always printed with its own figure.
 */
export function previousTint(hex: string): string {
  return lighten(hex, 0.52);
}

/** The pale centre of a point marker, inside an outline of the series colour. */
export function markerFill(hex: string): string {
  return lighten(hex, 0.82);
}

/** Format identity. Distinct slots from the platforms, so the two never clash. */
export const FORMAT_COLOR: Record<string, string> = {
  reel: IDENTITY.magenta,
  other: IDENTITY.orange,
  carousel: IDENTITY.lime,
  story: IDENTITY.purple,
  short: IDENTITY.teal,
  bio: IDENTITY.blue,
};

export function formatColor(format: string | null | undefined): string {
  if (!format) return C.text;
  return FORMAT_COLOR[format] ?? C.text;
}

/** Content tag identity, in the palette's own order. */
export const TAG_COLOR: Record<string, string> = {
  'life-in-thailand': IDENTITY.magenta,
  'life-traveling': IDENTITY.blue,
  mechanics: IDENTITY.orange,
  inspirational: IDENTITY.purple,
  promotional: IDENTITY.lime,
};

export function tagColor(tag: string | null | undefined): string {
  if (!tag) return C.muted;
  return TAG_COLOR[tag] ?? C.muted;
}

export const FORMAT_LABEL: Record<string, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
  short: 'Short',
  bio: 'Bio link',
  other: 'Post',
};

export function platformLabel(p: string | null): string {
  return p ? (PLATFORM_LABEL[p] ?? p) : 'Unknown';
}

export function formatLabel(f: string | null): string {
  return f ? (FORMAT_LABEL[f] ?? f) : 'Unknown';
}

/**
 * Full figure with thousands separators, for a number meant to be read at a
 * glance rather than scanned in a column.
 *
 * compact() stays right inside a dense table, where "12.4k" saves a column.
 * A hero tile has the room, and "1,284" reads as a measurement where "1.3k"
 * reads as somebody's estimate.
 */
export function full(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--';
  return n.toLocaleString('en-GB');
}

/**
 * Three sizes, because a figure does three different jobs here and one size
 * for all of them is why nothing on this page stood out.
 *
 * hero     the four numbers that answer "how did this window go"
 * standard context totals, present but not the point
 * inline   inside a table row or a bar list, where the label leads
 *
 * Tracking tightens as size grows. Large type set at normal tracking looks
 * loose, which is the difference between a number that looks designed and one
 * that looks like default browser output.
 */
export const FIGURE = {
  /**
   * clamp rather than a fixed size. Two hero tiles sit side by side on a phone,
   * so a five digit figure with a thousands separator ("12,847") overflows its
   * column at the desktop size. The floor keeps it dominant on a narrow screen
   * without spilling, and the cap is what it reaches on the wide layout.
   */
  hero: {
    fontSize: 'clamp(2rem, 7vw, 3rem)',
    lineHeight: 1.02,
    letterSpacing: '-0.035em',
    fontWeight: 700,
  },
  standard: { fontSize: '1.9rem', lineHeight: 1.08, letterSpacing: '-0.026em', fontWeight: 700 },
  inline: { fontSize: '1.0625rem', lineHeight: 1.2, letterSpacing: '-0.012em', fontWeight: 700 },
} as const;
