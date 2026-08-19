export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const PLATFORM_CODE: Record<string, string> = {
  instagram: 'ig',
  facebook: 'fb',
  tiktok: 'tt',
  youtube: 'yt',
};

const FORMAT_CODE: Record<string, string> = {
  reel: 'rl',
  carousel: 'cr',
  story: 'st',
  short: 'sh',
  bio: 'bio',
  other: 'x',
};

export function generateSlug(platform: string, format: string): string {
  const p = PLATFORM_CODE[platform] ?? platform.slice(0, 2);
  const f = FORMAT_CODE[format] ?? format.slice(0, 2);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${p}-${f}-${rand}`;
}

export function appendUtms(
  destinationUrl: string,
  opts: { platform: string; format: string; theme: string; slug: string }
): string {
  try {
    const url = new URL(destinationUrl);
    url.searchParams.set('utm_source', slugify(opts.platform));
    url.searchParams.set('utm_medium', slugify(opts.format));
    if (opts.theme) url.searchParams.set('utm_campaign', opts.theme);
    url.searchParams.set('utm_content', opts.slug);
    return url.toString();
  } catch {
    return destinationUrl;
  }
}
