import Link from 'next/link';
import { parsePeriod, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import {
  getLatestAudience,
  getAudienceHistory,
  getWeeklyFollowerGains,
  getFollowerSignalStrength,
} from '@/lib/queries';
import {
  StatTile,
  TrendChart,
  Panel,
  Empty,
  SectionHeading,
  PageHeader,
  Disclosure,
} from '@/components/charts';
import { C, full, platformColor, shortDate } from '@/lib/theme';
import { BackLink } from '@/components/overview';
import { parsePlatform, withFilters } from '@/lib/overview';

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
  searchParams: Promise<PeriodParams & { platform?: string; back?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const [latest, signal, ...series] = await Promise.all([
    getLatestAudience(),
    getFollowerSignalStrength(),
    ...TRACKED.flatMap((t) => [
      getAudienceHistory(t.platform, period),
      getWeeklyFollowerGains(t.platform, period),
    ]),
  ]);

  /**
   * The most recent snapshot across every account. getLatestAudience returns one
   * row per platform and promises no particular order, so the newest date is
   * taken rather than assumed to be first.
   */
  const newestSnapshot = latest
    .map((r) => r.recorded_on as string)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="space-y-5">
      {sp.back === 'overview' && (
        <BackLink href={withFilters('/dashboard', period, parsePlatform(sp.platform))}>Back to Overview</BackLink>
      )}
      <PageHeader
        title="Audience"
        meta={[
          { label: 'Accounts tracked', value: String(latest.length) },
          { label: 'Latest snapshot', value: newestSnapshot ? shortDate(newestSnapshot) : '--' },
        ]}
      />

      <Disclosure summary="Why this history only goes back so far">
        Follower counts have no history in the platform APIs, so they exist only from the day
        recording started. Instagram and the Facebook Page were each backfilled 30 days on the first
        sync, which is as far back as Meta goes. Everything after that is a daily snapshot.
      </Disclosure>

      <PeriodPicker period={period} />

      {latest.length === 0 ? (
        <Empty message="No snapshots recorded yet. The first sync writes them." />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {latest.map((r) => (
            <StatTile
              key={r.platform as string}
              size="hero"
              label={LABEL[r.platform as string] ?? (r.platform as string)}
              value={full(r.followers as number)}
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
            <SectionHeading note={period.label}>{t.name}</SectionHeading>

            <Panel
              title={`${t.name} followers over time`}
              description="Total followers at each daily snapshot."
            >
              <TrendChart
                points={totalPoints}
                color={platformColor(t.platform)}
                valueLabel="Followers"
                emptyMessage="Needs at least two daily snapshots in this window. This chart fills in as the sync runs."
              />
            </Panel>

            <Panel title={`New ${t.name} followers per week`} description={t.gainsNote}>
              <TrendChart
                points={gainPoints}
                color={platformColor(t.platform)}
                valueLabel="New followers"
                emptyMessage="No follower gain history in this window yet."
              />
            </Panel>
          </div>
        );
      })}

      <Panel
        title="No theme correlation yet"
        description={`Instagram reported ${signal.total} new followers across ${signal.days} days. Too few events to split across themes without inventing a pattern.`}
        detail={{
          summary: 'What it would take, and the account this page cannot see',
          children: (
            <>
              Splitting {signal.total} follower events across content themes would be fitting a
              story to a handful of events, and you would make content decisions on noise. The
              snapshots are being recorded now so the question becomes answerable later, once
              follower events outnumber themes by enough to tell them apart.
              <br />
              <br />
              Separately, your personal Facebook profile is where your actual audience is, and Meta
              exposes no API for personal profiles at all. It can only be tracked by hand on the{' '}
              <Link href="/admin/audience" style={{ color: C.text, textDecoration: 'underline' }}>
                audience entry screen
              </Link>
              . Nothing on this page reflects it unless you enter it.
            </>
          ),
        }}
      >
        <p className="text-sm" style={{ color: C.muted }}>
          Recording continues daily, so this becomes answerable without any action from you.
        </p>
      </Panel>
    </div>
  );
}
