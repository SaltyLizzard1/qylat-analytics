'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { C, RADIUS } from '@/lib/theme';

/**
 * Every parameter that defines the selected window. A custom range lives in
 * `from` and `to`, not in `period`, and an earlier version carried only
 * `period` and `compare`, so a custom range vanished the moment a tab was
 * clicked. Kept as one list so a new period parameter has one place to go.
 */
const PERIOD_PARAMS = ['period', 'from', 'to', 'compare'] as const;

/**
 * Client component purely so the current tab can be marked. The active state
 * is a filled pill rather than a colour, which keeps the nav inside the black
 * and white base and leaves colour meaning status only.
 */
export function DashboardNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();

  /*
   * The selected period travels with you. Without this, changing the window on
   * Overview and then clicking Formats silently reverted to the default, which
   * is the single most confusing thing a period control can do.
   */
  const carry = (href: string) => {
    const q = new URLSearchParams();
    for (const key of PERIOD_PARAMS) {
      const value = params.get(key);
      if (value) q.set(key, value);
    }
    const s = q.toString();
    return s ? `${href}?${s}` : href;
  };

  return (
    <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
      {items.map((item) => {
        const active =
          item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={carry(item.href)}
            aria-current={active ? 'page' : undefined}
            className="text-sm px-3 py-1.5 whitespace-nowrap transition-colors"
            style={{
              borderRadius: RADIUS.sm,
              textDecoration: 'none',
              background: active ? C.text : 'transparent',
              color: active ? C.page : C.muted,
              fontWeight: active ? 600 : 400,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
