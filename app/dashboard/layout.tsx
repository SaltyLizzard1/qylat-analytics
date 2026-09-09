import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { C } from '@/lib/theme';

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/leaderboard', label: 'Leaderboard' },
  { href: '/dashboard/platforms', label: 'Platforms' },
  { href: '/dashboard/formats', label: 'Formats' },
  { href: '/dashboard/themes', label: 'Themes' },
  { href: '/dashboard/ctas', label: 'CTAs' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.page }}>
      <header
        className="sticky top-0 z-10"
        style={{ background: C.page, borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xl tracking-wide"
              style={{ fontWeight: 600, color: C.text, textDecoration: 'none' }}
            >
              QYLAT
            </Link>
            <span
              className="text-xs uppercase tracking-widest px-2 py-0.5 rounded"
              style={{ background: C.neutral, color: C.muted }}
            >
              Analytics
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/links"
              className="text-xs px-3 py-1.5 rounded"
              style={{ border: `1px solid ${C.border}`, color: C.text, textDecoration: 'none' }}
            >
              Links
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded"
                style={{ border: `1px solid ${C.border}`, color: C.muted, background: C.page }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm px-3 py-1.5 rounded whitespace-nowrap"
              style={{ color: C.text, textDecoration: 'none' }}
            >
              {item.label}
            </Link>
          ))}
          <span
            className="text-sm px-3 py-1.5 rounded whitespace-nowrap cursor-not-allowed"
            style={{ color: C.muted }}
            title="Needs the Vercel Analytics integration, Phase 3"
          >
            Funnel
          </span>
        </nav>
      </header>

      <main className="px-4 py-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
