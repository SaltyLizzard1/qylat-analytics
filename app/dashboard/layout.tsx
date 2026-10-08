import Link from 'next/link';
import localFont from 'next/font/local';
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
  { href: '/admin/inbox', label: 'I2P Inbox' },
];

/** A quiet control on the ink header. */
const HEADER_BUTTON = {
  background: C.card,
  color: C.text,
  borderRadius: RADIUS.pill,
  textDecoration: 'none',
  fontWeight: 500,
} as const;

/**
 * Inter, from the two files in app/fonts. Nothing is fetched from Google,
 * at build time or in the browser: next/font/local only reads the files
 * here. `swap` shows the system font until it arrives. Scoped to the
 * dashboard, so the admin screens keep the system font they had.
 */
const inter = localFont({
  src: [
    { path: '../fonts/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: '../fonts/inter-latin-ext-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-inter',
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} dash`} style={{ minHeight: '100vh', background: C.page }}>
      {/* A pale periwinkle with dark text: the frame, a shade deeper than the page. */}
      <header className="sticky top-0 z-20" style={{ background: C.header, boxShadow: '0 1px 0 rgba(19, 21, 43, 0.08)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2.5">
            <Link
              href="/dashboard"
              className="flex items-baseline gap-2"
              style={{ color: C.text, textDecoration: 'none' }}
            >
              <span style={{ fontWeight: 600, fontSize: '1.25rem', letterSpacing: '0.01em' }}>QYLAT</span>
              <span
                className="uppercase hidden sm:inline"
                style={{ color: C.onHeaderMuted, fontSize: '0.8125rem', letterSpacing: '0.12em', fontWeight: 600 }}
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
                  style={{ background: 'transparent', color: C.onHeaderMuted, borderRadius: RADIUS.pill, cursor: 'pointer' }}
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
