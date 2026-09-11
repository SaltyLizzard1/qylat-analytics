import { sql } from '@/lib/db';
import { SyncButtons } from './SyncButtons';
import { C, RADIUS, TITLE, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function SyncPage() {
  const meta = await sql`SELECT MAX(last_synced_at) AS at, COUNT(*)::int AS posts FROM posts`;
  const ga = await sql`SELECT MAX(synced_at) AS at, COUNT(*)::int AS rows FROM site_sessions`;
  const aud = await sql`
    SELECT DISTINCT ON (platform) platform, followers, recorded_on
    FROM audience_snapshots WHERE followers IS NOT NULL ORDER BY platform, recorded_on DESC
  `;

  const when = (v: unknown) =>
    v ? new Date(v as string).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'never';

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1" style={{ ...TITLE, fontSize: '1.6rem' }}>
          Sync
        </h1>
        <p className="text-sm" style={{ color: C.muted, maxWidth: '70ch' }}>
          Both sources run on their own each morning, Meta at 08:00 UTC and Google Analytics at
          08:30. Use these when you have just posted and do not want to wait.
        </p>
      </div>

      <div className="p-5 mb-5" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}>
        <SyncButtons />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Card label="Meta" value={`${meta[0]?.posts ?? 0} posts`} sub={`last synced ${when(meta[0]?.at)}`} />
        <Card label="Google Analytics" value={`${ga[0]?.rows ?? 0} session rows`} sub={`last synced ${when(ga[0]?.at)}`} />
        {aud.map((a) => (
          <Card
            key={a.platform as string}
            label={`${a.platform === 'instagram' ? 'Instagram' : 'Facebook Page'} followers`}
            value={String(a.followers)}
            sub={`recorded ${shortDate(a.recorded_on as string)}`}
          />
        ))}
      </div>

      <p className="text-xs mt-5 px-3 py-2.5" style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm, borderLeft: `2px solid ${C.border}`, lineHeight: 1.6 }}>
        A manual run hits exactly the same endpoint as the scheduled one, with the same secret, so
        if it works here the morning job works too. Meta is pulled over a 7 day window and Google
        Analytics over 14, because GA keeps revising recent days for up to 48 hours.
      </p>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="px-4 py-3.5" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}>
      <p className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p className="text-xl mt-1.5" style={{ fontWeight: 600, color: C.text }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: C.muted }}>
        {sub}
      </p>
    </div>
  );
}
