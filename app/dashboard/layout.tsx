import { logout } from '@/app/login/actions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF' }}>
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: '#FFFFFF', borderBottom: '1px solid #D0D0D0' }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xl tracking-wide"
            style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 600, color: '#111111' }}
          >
            QYLAT
          </span>
          <span
            className="text-xs uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: '#F2F2F2', color: '#555555' }}
          >
            Analytics
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">Leaderboard</span>
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">Platforms</span>
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">Formats</span>
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">Themes</span>
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">CTAs</span>
          <span className="cursor-not-allowed" style={{ color: '#555555' }} title="Coming in Phase 6">Funnel</span>
          <a href="/admin/links" style={{ color: '#111111', textDecoration: 'underline' }}>Links</a>
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded"
            style={{ border: '1px solid #D0D0D0', color: '#555555', background: '#FFFFFF' }}
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="px-4 py-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
