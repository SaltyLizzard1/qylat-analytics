import { logout } from '@/app/login/actions';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0F0A05' }}>
      {/* Top nav */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{
          background: '#1A1008',
          borderBottom: '1px solid #3A2210',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="text-xl font-bold tracking-wide"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
          >
            QYLAT
          </span>
          <span
            className="text-xs uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: '#3A2210', color: '#8A7A60' }}
          >
            Analytics
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm" style={{ color: '#8A7A60' }}>
          <span className="cursor-not-allowed" title="Coming in Phase 6">Leaderboard</span>
          <span className="cursor-not-allowed" title="Coming in Phase 6">Platforms</span>
          <span className="cursor-not-allowed" title="Coming in Phase 6">Formats</span>
          <span className="cursor-not-allowed" title="Coming in Phase 6">Themes</span>
          <span className="cursor-not-allowed" title="Coming in Phase 6">CTAs</span>
          <span className="cursor-not-allowed" title="Coming in Phase 6">Funnel</span>
          <a href="/admin/links" style={{ color: '#E8C84A' }}>Links</a>
        </nav>

        <form action={logout}>
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded transition-colors"
            style={{ border: '1px solid #3A2210', color: '#8A7A60' }}
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="px-4 py-8 max-w-6xl mx-auto">{children}</main>
    </div>
  );
}
