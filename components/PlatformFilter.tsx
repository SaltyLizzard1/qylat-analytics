'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { C, RADIUS, platformColor } from '@/lib/theme';

/**
 * Which account the page shows. Sits beside the period control at the top, and
 * like it lives in the URL, so a filtered view can be bookmarked and survives
 * a click into a detail and back.
 *
 * The three accounts are named in full. "Facebook" alone would hide that the
 * Page and the personal profile are different audiences read in different ways.
 */
const CHOICES = [
  { value: 'all', label: 'All accounts' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook Page' },
  { value: 'facebook-personal', label: 'Facebook Profile' },
] as const;

export function PlatformFilter({ current }: { current: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (value: string) => {
    const q = new URLSearchParams(params.toString());
    if (value === 'all') q.delete('platform');
    else q.set('platform', value);
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Account">
      {CHOICES.map((c) => {
        const active = current === c.value;
        return (
          <Link
            key={c.value}
            href={hrefFor(c.value)}
            aria-current={active ? 'true' : undefined}
            className="text-xs px-2.5 py-1 inline-flex items-center gap-1.5"
            style={{
              borderRadius: RADIUS.sm,
              border: `1px solid ${active ? C.text : C.border}`,
              background: active ? C.text : C.card,
              color: active ? C.page : C.muted,
              fontWeight: active ? 600 : 400,
              textDecoration: 'none',
            }}
          >
            {c.value !== 'all' && (
              <span
                aria-hidden
                style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: platformColor(c.value) }}
              />
            )}
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
