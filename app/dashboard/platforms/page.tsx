import { getPlatformComparison, getClicksByPlatform } from '@/lib/queries';
import { BarList, Panel, Note, PageHeader, type BarDatum } from '@/components/charts';
import { DataRows, Chip, Sub, type Column } from '@/components/DataRows';
import { C, compact, platformLabel, platformColor } from '@/lib/theme';
import type { Row } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PlatformsPage() {
  const [platforms, clicks] = await Promise.all([getPlatformComparison(), getClicksByPlatform()]);

  // Only platforms with post data get a bar. A zero length bar for TikTok
  // would claim its posts got no views, when the truth is nothing can see them.
  const measured = platforms.filter((r) => r.has_posts);
  const unmeasured = platforms.filter((r) => !r.has_posts);

  const bar = (r: Row, field: 'avg_views' | 'views'): BarDatum => ({
    key: `${field}-${r.platform}`,
    label: platformLabel(r.platform as string),
    value: (r[field] as number) ?? 0,
    meta: `${r.posts} posts`,
    color: platformColor(r.platform as string),
    title: `${platformLabel(r.platform as string)}: ${r[field]} across ${r.posts} posts`,
  });

  const clickBars: BarDatum[] = clicks.map((r) => ({
    key: r.platform as string,
    label: platformLabel(r.platform as string),
    value: (r.clicks as number) ?? 0,
    meta: `${r.links} links`,
    color: platformColor(r.platform as string),
  }));

  const dash = <Sub>--</Sub>;

  const columns: Column<Row>[] = [
    {
      key: 'platform',
      label: 'Platform',
      width: 'minmax(8rem, 1.4fr)',
      render: (r) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: platformColor(r.platform as string),
              flexShrink: 0,
            }}
          />
          <span className="truncate">{platformLabel(r.platform as string)}</span>
        </span>
      ),
    },
    {
      key: 'posts',
      label: 'Posts',
      align: 'right',
      width: '4.5rem',
      render: (r) => (r.has_posts ? (r.posts as number) : dash),
    },
    {
      key: 'views',
      label: 'Views',
      align: 'right',
      width: '5rem',
      render: (r) => (r.has_posts ? compact(r.views as number) : dash),
    },
    {
      key: 'avg_views',
      label: 'Avg views',
      align: 'right',
      width: '6rem',
      bold: true,
      render: (r) => (r.has_posts ? compact(r.avg_views as number) : dash),
    },
    {
      key: 'engagement',
      label: 'Engagement',
      align: 'right',
      width: '6.5rem',
      render: (r) => (r.has_posts ? compact(r.engagement as number) : dash),
    },
    {
      key: 'source',
      label: 'Post data',
      width: '8rem',
      render: (r) => <Chip>{r.has_posts ? 'Synced from Meta' : 'Not integrated'}</Chip>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform Comparison"
        lead="Which platform earns attention per post published, and which one actually sends clicks. Colour here says which platform, never how well it did."
      />

      <Panel
        title="Average views per post"
        description="The fair comparison. Total views rewards whichever platform you posted to more often."
      >
        <BarList
          data={measured.map((r) => bar(r, 'avg_views'))}
          valueLabel="Average views per post"
        />
      </Panel>

      <Panel title="Total views" description="Raw volume, for context only.">
        <BarList data={measured.map((r) => bar(r, 'views'))} valueLabel="Total views" />
      </Panel>

      <Panel
        title="Clicks by link platform"
        description="First party clicks, attributed by the platform you tagged on each /go/ link. This works for every platform, including the ones with no post integration."
      >
        <BarList
          data={clickBars}
          valueLabel="Clicks"
          emptyMessage="No /go/ links have been clicked yet."
        />
      </Panel>

      <Panel title="The numbers" description="Every platform you use, measured or not.">
        <DataRows
          columns={columns}
          rows={platforms}
          keyOf={(r) => r.platform as string}
          emptyMessage="No posts or links yet."
        />
        {unmeasured.length > 0 && (
          <Note>
            {unmeasured.map((r) => platformLabel(r.platform as string)).join(' and ')}{' '}
            {unmeasured.length === 1 ? 'shows' : 'show'} a dash rather than a zero on the post
            columns. There is no API integration for{' '}
            {unmeasured.length === 1 ? 'it' : 'them'}, so views and engagement are unknown, not
            absent. Clicks on {unmeasured.length === 1 ? 'its' : 'their'} /go/ links are still
            tracked and appear above.
          </Note>
        )}
        <Note>
          Facebook reach is excluded from this page entirely. Meta accepts the reach metric for Page
          posts and returns zero for all of them, so any reach based comparison would show Facebook
          as dead when it is not. Instagram reach is populated and appears on the leaderboard.
        </Note>
      </Panel>
    </div>
  );
}
