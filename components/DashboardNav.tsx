'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C, RADIUS } from '@/lib/theme';

/**
 * Client component purely so the current tab can be marked. The active state
 * is a filled pill rather than a colour, which keeps the nav inside the black
 * and white base and leaves colour meaning status only.
 */
export function DashboardNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
      {items.map((item) => {
        const active =
          item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
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
