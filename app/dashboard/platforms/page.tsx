import { getPlatformComparison, getClicksByPlatform, getSplits } from '@/lib/queries';
import { parsePeriod, periodPhrase } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { BarList, Panel, Note, PageHeader, Disclosure, type BarDatum } from '@/components/charts';
import { DataRows, Chip, Sub, type Column } from '@/components/DataRows';
import { Donut, type Slice } from '@/components/Donut';
import { C, compact, platformLabel, platformColor } from '@/lib/theme';
import type { Row } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function PlatformsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>;
}) {
  const period = parsePeriod(await searchParams);
  const [platforms, clicks, splits] = await Promise.all([
    getPlatformComparison(period),
    getClicksByPlatform(period),
    getSplits(period),
  ]);

  const viewSlices: Slice[] = splits.byPlatform.map((r) => ({
    key: r.key as string,
    label: platformLabel(r.key as string),
    value: (r.value as number) ?? 0,
    color: platformColor(r.key as string),
  }));

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
        meta={[
          { label: 'Measured', value: String(measured.length) },
          { label: 'Not integrated', value: String(unmeasured.length) },
          { label: 'Window', value: period.label },
        ]}
      />

      <Disclosure summary="How to read this page, and what colour means here">
        Two different questions sit on this page: which platform earns attention per post published,
        and which one actually sends clicks. They have different answers. Colour says which platform
        and nothing about quality, so a hue here is never a verdict. Every bar is labelled, so the
        chart still reads with the colour removed.
      </Disclosure>

      <PeriodPicker period={period} />

      <Panel
        title="Average lifetime views per post"
        description={`Posts published ${periodPhrase(period)}, lifetime views as of today.`}
        detail={{
          summary: 'Why this is not a like-for-like comparison',
          children:
            'Posts published earlier in the window have had longer to accumulate views, so part of what separates these bars is age rather than performance. Recent Posts compares posts at the same age and answers the question this chart cannot.',
        }}
      >
        <BarList
          data={measured.map((r) => bar(r, 'avg_views'))}
          valueLabel="Average views per post"
        />
      </Panel>

      <Panel
        title="Share of all views"
        description="Part to whole. Which platform your total attention actually comes from."
      >
        <Donut data={viewSlices} valueLabel="Share of views" emptyMessage="No views recorded yet." />
      </Panel>

      <Panel title="Total lifetime views" description={`Raw volume across posts published ${periodPhrase(period)}, for context only.`}>
        <BarList data={measured.map((r) => bar(r, 'views'))} valueLabel="Total views" />
      </Panel>

      <Panel
        title="Clicks by link platform"
        description={`First party clicks that happened ${periodPhrase(period)}, attributed by the platform tagged on each /go/ link.`}
        detail={{
          summary: 'Why this covers platforms the charts above cannot',
          children:
            'A click is attributed by the platform you tagged on the /go/ link, not by any platform API, so it works for TikTok and YouTube exactly as well as for Instagram. Counted from human_clicks, so Meta fetching a link to build its preview is excluded.',
        }}
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
            {unmeasured.length === 1 ? 'shows' : 'show'} a dash, not a zero: views and engagement are
            unknown rather than absent. Clicks on {unmeasured.length === 1 ? 'its' : 'their'} /go/
            links are still tracked and appear above.
          </Note>
        )}
        <Disclosure summary="Why reach appears nowhere on this page">
          Meta accepts the reach metric for Facebook Page posts and returns zero for every one of
          them, so any reach based comparison would show Facebook as dead when it is not. Every
          comparison here uses views instead. Instagram reach is populated and appears on the
          leaderboard.
        </Disclosure>
      </Panel>
    </div>
  );
}
