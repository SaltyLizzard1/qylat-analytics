'use server';

import { sql } from '@/lib/db';
import { generateSlug, appendUtms, slugify } from '@/lib/utm';

export type CreateLinkState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; slug: string; utmUrl: string };

export async function createLink(
  _prev: CreateLinkState,
  formData: FormData
): Promise<CreateLinkState> {
  const platform = (formData.get('platform') as string)?.trim();
  const format = (formData.get('format') as string)?.trim();
  const ctaType = (formData.get('cta_type') as string)?.trim() || null;
  const rawTheme = (formData.get('content_theme') as string)?.trim();
  const contentTheme = slugify(rawTheme ?? '');
  const destinationUrl = (formData.get('destination_url') as string)?.trim();
  const customSlug = slugify((formData.get('custom_slug') as string)?.trim() ?? '');

  if (!platform || !format || !destinationUrl) {
    return { status: 'error', message: 'Platform, format, and destination URL are required.' };
  }

  try {
    new URL(destinationUrl);
  } catch {
    return { status: 'error', message: 'Destination URL is not valid. Make sure it starts with https://' };
  }

  const slug = customSlug || generateSlug(platform, format);

  const utmUrl = appendUtms(destinationUrl, {
    platform,
    format,
    theme: contentTheme,
    slug,
  });

  try {
    await sql`
      INSERT INTO links (slug, destination_url, utm_url, platform, format, content_theme, cta_type)
      VALUES (${slug}, ${destinationUrl}, ${utmUrl}, ${platform}, ${format}, ${contentTheme || null}, ${ctaType})
    `;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return { status: 'error', message: `The slug "${slug}" is already taken. Enter a custom slug.` };
    }
    console.error('DB error creating link:', e);
    return { status: 'error', message: 'Could not save to database. Try again.' };
  }

  return { status: 'success', slug, utmUrl };
}
