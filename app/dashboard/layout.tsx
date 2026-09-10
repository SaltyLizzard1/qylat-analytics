import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { DashboardNav } from '@/components/DashboardNav';
import { C, RADIUS } from '@/lib/theme';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/leaderboard', label: 'Leaderboard' },
  { href: '/dashboard/platforms', label: 'Platforms' },
  { href: '/dashboard/formats', label: 'Formats' },
  { href: '/dashboard/themes', label: 'Themes' },
  { href: '/dashboard/ctas', label: 'CTAs' },
  { href: '/dashboard/audience', label: 'Audience' },
  { href: '/dashboard/growth', label: 'Growth' },
  { href: '/dashboard/funnel', label: 'Funnel' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.page }}>
      <header
        className="sticky top-0 z-10"
        style={{ background: C.page, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            <Link
              href="/dashboard"
              style={{
                fontWeight: 600,
                color: C.text,
                textDecoration: 'none',
                fontSize: '1.1rem',
                letterSpacing: '0.02em',
              }}
            >
              QYLAT
            </Link>
            <span
              className="text-xs uppercase px-2 py-0.5"
              style={{
                background: C.neutral,
                color: C.muted,
                borderRadius: RADIUS.sm,
                letterSpacing: '0.08em',
              }}
            >
              Analytics
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/links"
              className="text-xs px-3 py-1.5"
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: RADIUS.sm,
                color: C.text,
                textDecoration: 'none',
              }}
            >
              Admin
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs px-3 py-1.5"
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: RADIUS.sm,
                  color: C.muted,
                  background: C.page,
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <DashboardNav items={NAV} />
      </header>

      <main className="px-4 py-7 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
