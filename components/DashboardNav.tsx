'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { C, RADIUS } from '@/lib/theme';

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
    const period = params.get('period');
    const compare = params.get('compare');
    if (!period && !compare) return href;
    const q = new URLSearchParams();
    if (period) q.set('period', period);
    if (compare) q.set('compare', compare);
    return `${href}?${q.toString()}`;
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
