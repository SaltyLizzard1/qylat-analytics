import Link from 'next/link';
import { parsePeriod, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import {
  getLatestAudience,
  getAudienceHistory,
  getWeeklyFollowerGains,
  getFollowerSignalStrength,
} from '@/lib/queries';
import { StatTile, TrendChart, Panel, Empty, Note, SectionHeading } from '@/components/charts';
import { C, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook Page',
  'facebook-personal': 'Facebook personal',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

/**
 * The accounts an API can read. Each gets the same pair of charts, so the
 * Facebook Page is inspected the same way Instagram is rather than showing a
 * single current number with no history behind it.
 */
const TRACKED = [
  { platform: 'instagram', name: 'Instagram', gainsNote: 'Daily gains reported by Instagram, grouped by week. Backfilled 30 days on first sync, which is as far back as the API goes.' },
  { platform: 'facebook', name: 'Facebook Page', gainsNote: 'Daily follows reported by the Page, grouped by week. Backfilled 30 days on first sync.' },
] as const;

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams>;
}) {
  const period = parsePeriod(await searchParams);
  const [latest, signal, ...series] = await Promise.all([
    getLatestAudience(),
    getFollowerSignalStrength(),
    ...TRACKED.flatMap((t) => [
      getAudienceHistory(t.platform, period),
      getWeeklyFollowerGains(t.platform, period),
    ]),
  ]);

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

      <PeriodPicker period={period} />

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

      {TRACKED.map((t, i) => {
        const history = series[i * 2] as Record<string, unknown>[];
        const gains = series[i * 2 + 1] as Record<string, unknown>[];
        const totalPoints = history.map((r) => ({
          label: shortDate(r.recorded_on as string),
          value: (r.followers as number) ?? 0,
        }));
        const gainPoints = gains.map((r) => ({
          label: shortDate(r.week as string),
          value: (r.gained as number) ?? 0,
        }));

        return (
          <div key={t.platform} id={t.platform} className="space-y-5">
            <SectionHeading note={period.label.toLowerCase()}>{t.name}</SectionHeading>

            <Panel
              title={`${t.name} followers over time`}
              description="Total followers at each daily snapshot."
            >
              <TrendChart
                points={totalPoints}
                valueLabel="Followers"
                emptyMessage="Needs at least two daily snapshots in this window. This chart fills in as the sync runs."
              />
            </Panel>

            <Panel title={`New ${t.name} followers per week`} description={t.gainsNote}>
              <TrendChart
                points={gainPoints}
                valueLabel="New followers"
                emptyMessage="No follower gain history in this window yet."
              />
            </Panel>
          </div>
        );
      })}

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
