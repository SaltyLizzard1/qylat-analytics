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
const PERIOD_PARAMS = ['period', 'from', 'to', 'compare', 'platform'] as const;

/**
 * Client component purely so the current tab can be marked. On the pale
 * header the current tab is a white pill with dark, heavier text, so where
 * you are is the first thing read. It is also marked with
 * aria-current, so it does not rest on the fill alone.
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
    <nav className="flex items-center gap-1 px-3 pb-2.5 overflow-x-auto" aria-label="Dashboard sections">
      {items.map((item) => {
        const active =
          item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={carry(item.href)}
            aria-current={active ? 'page' : undefined}
            className="text-xs px-3 py-1.5 whitespace-nowrap transition-colors"
            style={{
              borderRadius: RADIUS.pill,
              textDecoration: 'none',
              background: active ? C.card : 'transparent',
              color: active ? C.text : C.onHeaderMuted,
              fontWeight: active ? 600 : 500,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
