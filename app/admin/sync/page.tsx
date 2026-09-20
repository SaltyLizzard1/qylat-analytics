import Link from 'next/link';
import { sql } from '@/lib/db';
import { SyncButtons } from './SyncButtons';
import { C, RADIUS, TITLE, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * Where each account's follower history lives. The audience page gives every
 * API readable account its own section, anchored by platform.
 */
const FOLLOWER_HREF: Record<string, string> = {
  instagram: '/dashboard/audience?period=30#instagram',
  facebook: '/dashboard/audience?period=30#facebook',
};

export default async function SyncPage() {
  // Posts and Page updates are counted apart, so the number on the card is
  // the number of rows on the page it opens.
  const meta = await sql`
    SELECT MAX(last_synced_at) AS at,
           COUNT(*) FILTER (WHERE page_update IS NULL)::int     AS posts,
           COUNT(*) FILTER (WHERE page_update IS NOT NULL)::int AS updates
    FROM posts
  `;
  const ga = await sql`SELECT MAX(synced_at) AS at, COUNT(*)::int AS rows FROM site_sessions`;
  const aud = await sql`
    SELECT DISTINCT ON (platform) platform, followers, recorded_on
    FROM audience_snapshots WHERE followers IS NOT NULL ORDER BY platform, recorded_on DESC
  `;

  const when = (v: unknown) => (v ? shortDateTime(v as string) : 'never');
  const updates = (meta[0]?.updates as number) ?? 0;

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1" style={{ ...TITLE, fontSize: '1.6rem' }}>
          Sync
        </h1>
        <p className="text-sm" style={{ color: C.muted, maxWidth: '70ch' }}>
          Both sources run on their own each day, Meta at 15:00 and Google Analytics at 15:30 Chiang
          Mai time, which is 08:00 and 08:30 UTC. Use these when you have just posted and do not want
          to wait. Every time on this page is Chiang Mai time.
        </p>
      </div>

      <div className="p-5 mb-5" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}>
        <SyncButtons />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Card
          label="Meta"
          value={`${meta[0]?.posts ?? 0} posts`}
          sub={`last synced ${when(meta[0]?.at)}`}
          href="/admin/posts?filter=all"
          linkText="View posts"
          extra={
            updates > 0 ? (
              <>
                plus{' '}
                <Link href="/admin/posts?filter=updates" style={{ color: C.text, textDecoration: 'underline' }}>
                  {updates} Page {updates === 1 ? 'update' : 'updates'}
                </Link>
              </>
            ) : undefined
          }
        />
        <Card
          label="Google Analytics"
          value={`${ga[0]?.rows ?? 0} session rows`}
          sub={`last synced ${when(ga[0]?.at)}`}
          href="/dashboard/funnel?period=14"
          linkText="View traffic"
        />
        {aud.map((a) => {
          const platform = a.platform as string;
          return (
            <Card
              key={platform}
              label={`${platform === 'instagram' ? 'Instagram' : platform === 'facebook' ? 'Facebook Page' : platform} followers`}
              value={String(a.followers)}
              sub={`recorded ${shortDate(a.recorded_on as string)}`}
              href={FOLLOWER_HREF[platform] ?? '/dashboard/audience?period=30'}
              linkText="View followers"
            />
          );
        })}
      </div>

      <p className="text-xs mt-5 px-3 py-2.5" style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm, borderLeft: `2px solid ${C.border}`, lineHeight: 1.6 }}>
        A manual run hits exactly the same endpoint as the scheduled one, with the same secret, so
        if it works here the daily job works too. Meta is pulled over a 7 day window and Google
        Analytics over 14, because GA keeps revising recent days for up to 48 hours.
      </p>
    </div>
  );
}

/**
 * A summary card that opens the data behind its number.
 *
 * The whole card is the target: the link's ::after is stretched over it, so
 * there is one real anchor with a readable name rather than a clickable div.
 * `extra` sits above that layer, which is what lets the Meta card carry a
 * second link to the Page updates without nesting one anchor inside another.
 */
function Card({
  label,
  value,
  sub,
  href,
  linkText,
  extra,
}: {
  label: string;
  value: string;
  sub: string;
  href: string;
  linkText: string;
  extra?: React.ReactNode;
}) {
  return (
    <div
      className="group relative px-4 py-3.5"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}
    >
      <p className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p className="text-xl mt-1.5" style={{ fontWeight: 600, color: C.text }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: C.muted }}>
        {sub}
      </p>
      {extra && (
        <p className="text-xs mt-1 relative z-10" style={{ color: C.muted }}>
          {extra}
        </p>
      )}
      <Link
        href={href}
        className="text-xs mt-2 inline-block group-hover:underline after:absolute after:inset-0 after:content-['']"
        style={{ color: C.text, fontWeight: 600, textDecoration: 'none' }}
      >
        {linkText} <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
