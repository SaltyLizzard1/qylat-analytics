import Link from 'next/link';
import { getOverview, getWeeklyViews, getWeeklyClicks } from '@/lib/queries';
import { StatTile, TrendChart, Panel, Note } from '@/components/charts';
import { C, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [overview, weeklyViews, weeklyClicks] = await Promise.all([
    getOverview(),
    getWeeklyViews(),
    getWeeklyClicks(),
  ]);

  const viewPoints = weeklyViews.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.views as number) ?? 0,
  }));
  const clickPoints = weeklyClicks.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.clicks as number) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Overview
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          {overview.posts > 0
            ? `${overview.posts} posts from ${shortDate(overview.earliest)} to ${shortDate(overview.latestPost)}.`
            : 'No posts synced yet.'}
          {overview.lastSyncedAt
            ? ` Last sync ${new Date(overview.lastSyncedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}.`
            : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Posts" value={compact(overview.posts)} sub="Facebook and Instagram" />
        <StatTile label="Views" value={compact(overview.views)} sub="latest snapshot per post" />
        <StatTile label="Engagement" value={compact(overview.engagement)} sub="likes, comments, saves, shares" />
        <StatTile label="Link clicks" value={compact(overview.clicks)} sub={`across ${overview.links} /go/ links`} />
      </div>

      <Panel
        title="Views per week"
        description="Total views of everything published that week, from the latest snapshot of each post."
      >
        <TrendChart points={viewPoints} valueLabel="Views" />
      </Panel>

      <Panel
        title="Link clicks per week"
        description="First party clicks on your /go/ links. This is the number that says whether social is actually sending people to the site."
      >
        <TrendChart
          points={clickPoints}
          valueLabel="Clicks"
          emptyMessage="Needs at least two weeks of click data."
        />
        <Note>
          Views and clicks are plotted separately on purpose. They are different scales, and putting
          them on one chart with two axes would invent a relationship that is not in the data.
        </Note>
      </Panel>

      <Panel title="What is not here yet" description="Two gaps worth knowing about.">
        <ul className="text-sm space-y-2" style={{ color: C.muted }}>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Facebook reach reads zero.</span> Meta
            accepts the metric and returns 0 for every Page post, so every comparison here uses views
            instead. Instagram reach is fine.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Posts are not linked to clicks.</span>{' '}
            Nothing in the Meta data says which post drove which click. Tag posts with a content
            theme on the{' '}
            <Link href="/admin/posts" style={{ color: C.text, textDecoration: 'underline' }}>
              posts screen
            </Link>{' '}
            to join the two sides together.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
