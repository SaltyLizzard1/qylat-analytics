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

export const CARD = {
  background: C.card,
  border: `1px solid ${C.border}`,
} as const;

export const HEADING = {
  fontWeight: 600,
  color: C.text,
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

export function pct(numerator: number | null, denominator: number | null): string {
  if (!numerator || !denominator) return '--';
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
