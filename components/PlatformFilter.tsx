'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { C, EYEBROW, RADIUS, platformColor } from '@/lib/theme';

/**
 * Which account the page shows. Sits beside the period control at the top, and
 * like it lives in the URL, so a filtered view can be bookmarked and survives
 * a click into a detail and back.
 *
 * The three accounts are named in full. "Facebook" alone would hide that the
 * Page and the personal profile are different audiences read in different ways.
 *
 * The selected account is filled with ink and marked aria-current. Each
 * account keeps its identity dot in both states, so the dot always means
 * which account and the fill always means selected.
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span style={EYEBROW}>Account</span>
      <div
        className="flex flex-wrap gap-0.5 p-0.5"
        role="group"
        aria-label="Account"
        style={{ background: C.neutral, borderRadius: RADIUS.md }}
      >
        {CHOICES.map((c) => {
          const active = current === c.value;
          return (
            <Link
              key={c.value}
              href={hrefFor(c.value)}
              aria-current={active ? 'true' : undefined}
              className="text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5"
              style={{
                borderRadius: RADIUS.sm,
                background: active ? C.ink : 'transparent',
                color: active ? C.onInk : C.text,
                fontWeight: active ? 700 : 500,
                textDecoration: 'none',
              }}
            >
              {c.value !== 'all' && (
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: RADIUS.pill,
                    background: platformColor(c.value),
                    // A white ring keeps the dot visible on the ink fill.
                    boxShadow: active ? `0 0 0 1.5px ${C.onInk}` : 'none',
                  }}
                />
              )}
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
