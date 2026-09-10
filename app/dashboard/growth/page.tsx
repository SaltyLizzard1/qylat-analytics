import Link from 'next/link';
import {
  getThemeFollowerAttribution,
  getWeeklyGrowthOverlap,
  getUntaggedPostCount,
  getFollowerSignalStrength,
} from '@/lib/queries';
import { PageHeader, Panel, PairedTrend, Empty, Note, StatTile } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { growthStatus } from '@/lib/status';
import { C, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LOOKAHEAD_DAYS = 2;

export default async function GrowthPage() {
  const [themes, weekly, untagged, signal] = await Promise.all([
    getThemeFollowerAttribution(LOOKAHEAD_DAYS),
    getWeeklyGrowthOverlap(),
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
        lead="Follower gain set against what you published. Instagram only, because the Facebook Page has no followers and your personal profile has no API."
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <StatusLegend />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          label="New followers"
          value={compact(signal.total)}
          sub={`across ${signal.days} days with any gain`}
          status={growth}
        />
        <StatTile label="Weeks of overlap" value={String(weeks)} sub="weeks with both post and follower data" />
        <StatTile
          label="Themes tagged"
          value={String(themes.length)}
          sub={untagged > 0 ? `${untagged} posts still untagged` : 'all posts tagged'}
        />
      </div>

      <Panel
        title="Publishing against follower gain, by week"
        description="Two charts sharing an x axis rather than one chart with two y axes. Posts and followers are different quantities, and a shared scale would assert a relationship the data has not earned."
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
        description={`Each post is credited with the follower gain from its publish day through the next ${LOOKAHEAD_DAYS} days. Days are counted once per theme, so two posts of one theme in the same week do not double count.`}
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

        <Note>
          This is attribution, not causation. A follower who arrives the day after a reel may have
          come from that reel, from a story, from a search, or from someone else sharing you.
          Instagram reported{' '}
          <span style={{ color: C.text, fontWeight: 600 }}>
            {signal.total} new followers across {signal.days} days
          </span>{' '}
          in the recorded window. At that volume, the Evidence column will read thin for a while,
          and it is telling you the truth. The numbers get trustworthy as the snapshots accumulate,
          which is why they are being recorded daily now.
        </Note>
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
