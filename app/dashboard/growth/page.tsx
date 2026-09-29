import Link from 'next/link';
import { parsePeriod } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import {
  getThemeFollowerAttribution,
  getWeeklyGrowthOverlap,
  getUntaggedPostCount,
  getFollowerSignalStrength,
} from '@/lib/queries';
import { PageHeader, Panel, PairedTrend, Empty, StatTile, Disclosure } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { growthStatus } from '@/lib/status';
import { C, compact, full, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LOOKAHEAD_DAYS = 2;

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>;
}) {
  const period = parsePeriod(await searchParams);
  const [themes, weekly, untagged, signal] = await Promise.all([
    getThemeFollowerAttribution(LOOKAHEAD_DAYS),
    getWeeklyGrowthOverlap(period),
    getUntaggedPostCount(),
    getFollowerSignalStrength(),
  ]);

  const postPoints = weekly.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.posts as number) ?? 0,
  }));
  const followerPoints = weekly.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.gained as number) ?? 0,
  }));

  const weeks = weekly.length;
  const growth = growthStatus(signal.total, signal.days || 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Growth"
        meta={[
          { label: 'Account', value: 'Instagram only' },
          { label: 'Weeks of overlap', value: String(weeks) },
          { label: 'Days with a gain', value: String(signal.days) },
        ]}
      />

      <Disclosure summary="Why this page is Instagram only">
        Follower gain set against what you published. The Facebook Page has almost no followers to
        gain, and your personal Facebook profile, which is where your audience actually is, has no
        API at all. Mixing them in would put a running total beside a daily gain, which is the fault
        that once reported 108 new followers in a week when the real figure was closer to ten.
      </Disclosure>

      <PeriodPicker period={period} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <StatusLegend />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          size="hero"
          label="New followers"
          value={full(signal.total)}
          sub={`across ${signal.days} days with any gain`}
          status={growth}
        />
        <StatTile
          size="hero"
          label="Weeks of overlap"
          value={String(weeks)}
          sub="weeks with both post and follower data"
        />
        <StatTile
          size="hero"
          label="Themes tagged"
          value={String(themes.length)}
          sub={untagged > 0 ? `${untagged} posts still untagged` : 'all posts tagged'}
        />
      </div>

      <Panel
        title="Publishing against follower gain, by week"
        description="Two charts sharing an x axis, never one chart with two y axes."
        detail={{
          summary: 'Why these are two charts and not one',
          children:
            'Posts and followers are different quantities on different scales. A shared y axis would assert a relationship the data has not earned, which is the most common way a chart lies. Aligning the x axis lets you compare the shapes without the chart claiming they move together.',
        }}
      >
        {weeks < 2 ? (
          <Empty message="Needs at least two weeks with both post and follower data." />
        ) : (
          <PairedTrend
            top={{ points: postPoints, label: 'Posts published' }}
            bottom={{ points: followerPoints, label: 'New Instagram followers' }}
          />
        )}
      </Panel>

      <Panel
        title="Follower gain by content theme"
        description={`Each post is credited with the follower gain from its publish day through the next ${LOOKAHEAD_DAYS} days.`}
      >
        {themes.length === 0 ? (
          <div>
            <Empty message="No posts carry a content theme yet, so there is nothing to attribute." />
            <div className="mt-4">
              <Link
                href="/admin/posts"
                className="inline-block px-4 py-2 text-sm font-semibold"
                style={{
                  background: C.text,
                  color: C.page,
                  border: `1px solid ${C.text}`,
                  borderRadius: '6px',
                  textDecoration: 'none',
                }}
              >
                Tag posts
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <Th>Theme</Th>
                  <Th right>Posts</Th>
                  <Th right>Views</Th>
                  <Th right>Followers</Th>
                  <Th right>Days counted</Th>
                  <Th>Evidence</Th>
                </tr>
              </thead>
              <tbody>
                {themes.map((r) => {
                  const gained = (r.followers_gained as number) ?? 0;
                  const days = (r.attributed_days as number) ?? 0;
                  return (
                    <tr key={r.theme as string} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <Td>{r.theme as string}</Td>
                      <Td right>{r.posts as number}</Td>
                      <Td right>{compact(r.views as number)}</Td>
                      <Td right bold>
                        {gained}
                      </Td>
                      <Td right>{days}</Td>
                      <Td>
                        <StatusBadge
                          status={
                            gained < 5
                              ? {
                                  level: 'bad',
                                  label: 'Too thin to read',
                                  reason: `${gained} follower events over ${days} days is not enough to attribute`,
                                }
                              : gained < 20
                                ? {
                                    level: 'warning',
                                    label: 'Indicative only',
                                    reason: `${gained} follower events over ${days} days, treat as a hint`,
                                  }
                                : {
                                    level: 'good',
                                    label: 'Worth acting on',
                                    reason: `${gained} follower events over ${days} days`,
                                  }
                          }
                          compact
                        />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Disclosure
          summary={`Attribution, not causation: ${signal.total} follower events across ${signal.days} days`}
        >
          A follower who arrives the day after a reel may have come from that reel, from a story,
          from a search, or from someone else sharing you. Days are counted once per theme, so two
          posts of one theme in the same week do not double count. At this volume the Evidence column
          will read thin for a while, and it is telling you the truth. It firms up as the daily
          snapshots accumulate.
        </Disclosure>
      </Panel>
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className="text-xs uppercase font-normal px-2 py-2"
      style={{ color: C.muted, textAlign: right ? 'right' : 'left', letterSpacing: '0.08em' }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right = false,
  bold = false,
}: {
  children: React.ReactNode;
  right?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      className="px-2 py-2.5 tabular-nums"
      style={{ textAlign: right ? 'right' : 'left', color: C.text, fontWeight: bold ? 600 : 400 }}
    >
      {children}
    </td>
  );
}
