import { getPlatformComparison, getClicksByPlatform } from '@/lib/queries';
import { BarList, Panel, Note, PageHeader, type BarDatum } from '@/components/charts';
import { DataRows, type Column } from '@/components/DataRows';
import { compact, platformLabel } from '@/lib/theme';
import type { Row } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PlatformsPage() {
  const [platforms, clicks] = await Promise.all([getPlatformComparison(), getClicksByPlatform()]);

  const avgViews: BarDatum[] = platforms.map((r) => ({
    key: r.platform as string,
    label: platformLabel(r.platform as string),
    value: (r.avg_views as number) ?? 0,
    meta: `${r.posts} posts`,
    title: `${platformLabel(r.platform as string)}: ${r.avg_views} average views across ${r.posts} posts`,
  }));

  const totalViews: BarDatum[] = platforms.map((r) => ({
    key: r.platform as string,
    label: platformLabel(r.platform as string),
    value: (r.views as number) ?? 0,
    meta: `${r.posts} posts`,
  }));

  const clickBars: BarDatum[] = clicks.map((r) => ({
    key: r.platform as string,
    label: platformLabel(r.platform as string),
    value: (r.clicks as number) ?? 0,
    meta: `${r.links} links`,
  }));

  const columns: Column<Row>[] = [
    {
      key: 'platform',
      label: 'Platform',
      width: 'minmax(7rem, 1.4fr)',
      render: (r) => platformLabel(r.platform as string),
    },
    { key: 'posts', label: 'Posts', align: 'right', width: '4rem', render: (r) => r.posts as number },
    {
      key: 'views',
      label: 'Views',
      align: 'right',
      width: '5rem',
      render: (r) => compact(r.views as number),
    },
    {
      key: 'avg',
      label: 'Avg views',
      align: 'right',
      width: '6rem',
      bold: true,
      render: (r) => compact(r.avg_views as number),
    },
    {
      key: 'engagement',
      label: 'Engagement',
      align: 'right',
      width: '6rem',
      render: (r) => compact(r.engagement as number),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform Comparison"
        lead="Which platform earns attention per post published, and which one actually sends clicks."
      />

      <Panel
        title="Average views per post"
        description="The fair comparison. Total views rewards whichever platform you posted to more often."
      >
        <BarList data={avgViews} valueLabel="Average views per post" />
      </Panel>

      <Panel title="Total views" description="Raw volume, for context only.">
        <BarList data={totalViews} valueLabel="Total views" />
      </Panel>

      <Panel
        title="Clicks by link platform"
        description="First party clicks, attributed by the platform you tagged on each /go/ link."
      >
        <BarList
          data={clickBars}
          valueLabel="Clicks"
          emptyMessage="No /go/ links have been clicked yet."
        />
        <Note>
          Facebook reach is excluded everywhere on this page. Meta accepts the reach metric for Page
          posts and returns zero for all of them, so any reach based comparison would show Facebook
          as dead when it is not. Instagram reach is populated and appears on the leaderboard.
        </Note>
      </Panel>

      <Panel title="The numbers" description="Same data, exact values.">
        <DataRows
          columns={columns}
          rows={platforms}
          keyOf={(r) => r.platform as string}
          emptyMessage="No posts synced yet."
        />
      </Panel>
    </div>
  );
}
