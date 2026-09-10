import Link from 'next/link';
import {
  getLatestAudience,
  getAudienceHistory,
  getWeeklyFollowerGains,
  getFollowerSignalStrength,
} from '@/lib/queries';
import { StatTile, TrendChart, Panel, Empty, Note } from '@/components/charts';
import { C, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Page',
  'facebook-personal': 'Facebook personal',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export default async function AudiencePage() {
  const [latest, igHistory, igGains, signal] = await Promise.all([
    getLatestAudience(),
    getAudienceHistory('instagram'),
    getWeeklyFollowerGains('instagram'),
    getFollowerSignalStrength(),
  ]);

  const totalPoints = igHistory.map((r) => ({
    label: shortDate(r.recorded_on as string),
    value: (r.followers as number) ?? 0,
  }));

  const gainPoints = igGains.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.gained as number) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Audience
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Follower counts, captured daily. These numbers have no history in the platform APIs, so
          they only exist from the day recording started.
        </p>
      </div>

      {latest.length === 0 ? (
        <Empty message="No snapshots recorded yet. The first sync writes them." />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {latest.map((r) => (
            <StatTile
              key={r.platform as string}
              label={LABEL[r.platform as string] ?? (r.platform as string)}
              value={compact(r.followers as number)}
              sub={`${r.source === 'manual' ? 'entered by hand' : 'from the API'}, ${shortDate(
                r.recorded_on as string
              )}`}
            />
          ))}
        </div>
      )}

      <Panel
        title="Instagram followers over time"
        description="Total followers at each daily snapshot."
      >
        <TrendChart
          points={totalPoints}
          valueLabel="Followers"
          emptyMessage="Needs at least two daily snapshots. This chart fills in as the sync runs."
        />
      </Panel>

      <Panel
        title="New Instagram followers per week"
        description="Daily gains reported by Instagram, grouped by week. Backfilled 30 days on first sync, which is as far back as the API goes."
      >
        <TrendChart
          points={gainPoints}
          valueLabel="New followers"
          emptyMessage="No follower gain history available yet."
        />
      </Panel>

      <Panel title="Why there is no theme correlation here">
        <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
          Instagram reported{' '}
          <span style={{ color: C.text, fontWeight: 600 }}>
            {signal.total} new followers across {signal.days} days
          </span>{' '}
          in the recorded window. Splitting that across content themes would be fitting a story to a
          handful of events, and you would make content decisions on noise. The snapshots are being
          recorded now so the question becomes answerable later, once follower events outnumber
          themes by enough to tell them apart.
        </p>
        <Note>
          Your personal Facebook profile is where your actual audience is, and Meta exposes no API
          for personal profiles at all. It can only be tracked by hand on the{' '}
          <Link href="/admin/audience" style={{ color: C.text, textDecoration: 'underline' }}>
            audience entry screen
          </Link>
          . Nothing on this page reflects it unless you enter it.
        </Note>
      </Panel>
    </div>
  );
}
