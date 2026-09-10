/**
 * The only colors allowed in this project. Plain black and white.
 * No cream, gold, tan or any warm tint. Severity states come from lib/severity.ts.
 */
export const C = {
  page: '#FFFFFF',
  card: '#FFFFFF',
  border: '#D0D0D0',
  text: '#111111',
  muted: '#555555',
  neutral: '#F2F2F2',
} as const;

/**
 * Depth without colour. The page and cards are both white, so a card needs a
 * hairline plus a barely-there neutral shadow to read as a surface. The shadow
 * is pure black at very low alpha, so it introduces no tint.
 */
export const SHADOW = '0 1px 2px rgba(17, 17, 17, 0.04), 0 2px 10px rgba(17, 17, 17, 0.03)';

export const RADIUS = { sm: '6px', md: '10px', lg: '14px', pill: '999px' } as const;

export const CARD = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.md,
  boxShadow: SHADOW,
} as const;

export const HEADING = {
  fontWeight: 600,
  color: C.text,
  letterSpacing: '-0.011em',
} as const;

/** Page title. Tighter tracking at larger sizes stops headings looking loose. */
export const TITLE = {
  fontWeight: 600,
  color: C.text,
  letterSpacing: '-0.021em',
} as const;

/** Small uppercase eyebrow above a heading or over a chart. */
export const EYEBROW = {
  fontSize: '0.6875rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.muted,
} as const;

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

export function shortDate(value: string | Date | null): string {
  if (!value) return '--';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
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
  tiktok: '#1A9AA3',
  youtube: C.muted,
};

export function platformColor(platform: string | null | undefined): string {
  if (!platform) return C.text;
  return PLATFORM_COLOR[platform] ?? C.text;
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
