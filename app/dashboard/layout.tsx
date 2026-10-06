import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { DashboardNav } from '@/components/DashboardNav';
import { C, RADIUS } from '@/lib/theme';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/recent', label: 'Recent' },
  { href: '/dashboard/leaderboard', label: 'Leaderboard' },
  { href: '/dashboard/content', label: 'Content' },
  { href: '/dashboard/platforms', label: 'Platforms' },
  { href: '/dashboard/formats', label: 'Formats' },
  { href: '/dashboard/themes', label: 'Themes' },
  { href: '/dashboard/ctas', label: 'CTAs' },
  { href: '/dashboard/audience', label: 'Audience' },
  { href: '/dashboard/growth', label: 'Growth' },
  { href: '/dashboard/funnel', label: 'Funnel' },
  { href: '/dashboard/profile', label: 'Profile' },
];

/** A quiet control on the ink header. */
const HEADER_BUTTON = {
  background: C.inkRaised,
  color: C.onInk,
  borderRadius: RADIUS.pill,
  textDecoration: 'none',
  fontWeight: 600,
} as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.page }}>
      {/* Deep ink, so the header reads as the frame and the page as the work. */}
      <header className="sticky top-0 z-20" style={{ background: C.ink }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5">
            <Link
              href="/dashboard"
              className="flex items-baseline gap-2"
              style={{ color: C.onInk, textDecoration: 'none' }}
            >
              <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '0.01em' }}>QYLAT</span>
              <span
                className="uppercase hidden sm:inline"
                style={{ color: C.onInkMuted, fontSize: '0.72rem', letterSpacing: '0.12em', fontWeight: 600 }}
              >
                Analytics
              </span>
            </Link>

            <div className="flex items-center gap-1.5">
              <Link href="/admin/sync" className="text-xs px-3 py-1.5 whitespace-nowrap" style={HEADER_BUTTON}>
                Sync now
              </Link>
              <Link href="/admin/links" className="text-xs px-3 py-1.5 whitespace-nowrap" style={HEADER_BUTTON}>
                Admin
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="text-xs px-2 py-1.5 whitespace-nowrap"
                  style={{ background: 'transparent', color: C.onInkMuted, borderRadius: RADIUS.pill, cursor: 'pointer' }}
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          <DashboardNav items={NAV} />
        </div>
      </header>

      <main className="px-4 py-7 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
