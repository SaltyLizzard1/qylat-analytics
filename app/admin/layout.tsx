import Link from 'next/link';
import { logout } from '@/app/login/actions';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF' }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #D0D0D0' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-lg tracking-wide flex-shrink-0"
            style={{ fontWeight: 600, color: '#111111', textDecoration: 'none' }}
          >
            QYLAT
          </Link>

          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/admin/links/new"
              className="px-3 py-1.5 rounded text-xs font-semibold flex-shrink-0"
              style={{
                background: '#111111',
                color: '#FFFFFF',
                border: '1px solid #111111',
                textDecoration: 'none',
              }}
            >
              + New Link
            </Link>
            <Link
              href="/admin/links"
              className="text-xs px-2 py-1.5 hidden sm:block"
              style={{ color: '#111111', textDecoration: 'underline' }}
            >
              All Links
            </Link>
            <Link
              href="/admin/clicks"
              className="text-xs px-2 py-1.5 hidden sm:block"
              style={{ color: '#111111', textDecoration: 'underline' }}
            >
              Click Log
            </Link>
            <Link
              href="/admin/posts"
              className="text-xs px-2 py-1.5 hidden sm:block"
              style={{ color: '#111111', textDecoration: 'underline' }}
            >
              Posts
            </Link>
            <Link
              href="/admin/sync"
              className="text-xs px-2 py-1.5 hidden sm:block"
              style={{ color: '#111111', textDecoration: 'underline' }}
            >
              Sync
            </Link>
            <Link
              href="/admin/audience"
              className="text-xs px-2 py-1.5 hidden sm:block"
              style={{ color: '#111111', textDecoration: 'underline' }}
            >
              Audience
            </Link>
          </nav>
        </div>

        <form action={logout} className="flex-shrink-0">
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded"
            style={{ border: '1px solid #D0D0D0', color: '#555555', background: '#FFFFFF' }}
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="px-4 py-6 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}
