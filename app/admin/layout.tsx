import Link from 'next/link';
import { logout } from '@/app/login/actions';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0F0A05' }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: '#1A1008', borderBottom: '1px solid #3A2210' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="text-lg font-bold tracking-wide flex-shrink-0"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
          >
            QYLAT
          </Link>

          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/admin/links/new"
              className="px-3 py-1.5 rounded text-xs font-semibold flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #8B6914, #E8C84A)',
                color: '#2D1A00',
                border: '1.5px solid #2D1A00',
              }}
            >
              + New Link
            </Link>
            <Link href="/admin/links" className="text-xs px-2 py-1.5 hidden sm:block" style={{ color: '#8A7A60' }}>
              All Links
            </Link>
            <Link href="/admin/clicks" className="text-xs px-2 py-1.5 hidden sm:block" style={{ color: '#8A7A60' }}>
              Click Log
            </Link>
          </nav>
        </div>

        <form action={logout} className="flex-shrink-0">
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded"
            style={{ border: '1px solid #3A2210', color: '#8A7A60' }}
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="px-4 py-6 max-w-3xl mx-auto">{children}</main>
    </div>
  );
}
