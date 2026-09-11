import { getFormatComparison, getSplits } from '@/lib/queries';
import { BarList, Panel, Note, PageHeader, type BarDatum } from '@/components/charts';
import { StatusLegend } from '@/components/status';
import { Donut, type Slice } from '@/components/Donut';
import { formatStatus, PERFORMANCE_SHORT, PERFORMANCE_LABEL } from '@/lib/status';
import { platformLabel, formatLabel, formatColor } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function FormatsPage() {
  const [rows, splits] = await Promise.all([getFormatComparison(), getSplits()]);

  const formatSlices: Slice[] = splits.byFormat.map((r) => ({
    key: r.key as string,
    label: formatLabel(r.key as string),
    value: (r.value as number) ?? 0,
    color: formatColor(r.key as string),
  }));

  const instagram = rows.filter((r) => r.platform === 'instagram');
  const facebook = rows.filter((r) => r.platform === 'facebook');

  /*
   * One scale per measure, shared across both platforms.
   *
   * Panels that normalise to themselves make every top bar full width, so
   * Facebook reels at 158 views looked identical to Instagram reels at 234,
   * and Facebook reels at 1 engagement looked identical to Instagram reels at
   * 14. The bars now carry the cross platform difference that the numbers
   * always showed.
   */
  const maxViews = Math.max(...rows.map((r) => (r.avg_views as number) ?? 0), 1);
  const maxEngagement = Math.max(...rows.map((r) => (r.avg_engagement as number) ?? 0), 1);

  /** Average views per post across a whole platform, the benchmark each format is judged against. */
  const platformAverage = (list: typeof rows): number => {
    const posts = list.reduce((n, r) => n + ((r.posts as number) ?? 0), 0);
    const views = list.reduce((n, r) => n + ((r.views as number) ?? 0), 0);
    return posts > 0 ? views / posts : 0;
  };

  const toBars = (list: typeof rows, field: 'avg_views' | 'avg_engagement'): BarDatum[] => {
    const benchmark = platformAverage(list);
    return list.map((r) => ({
      key: `${r.platform}-${r.format}-${field}`,
      label: formatLabel(r.format as string),
      value: (r[field] as number) ?? 0,
      meta: `${r.posts} posts`,
      color: formatColor(r.format as string),
      title: `${platformLabel(r.platform as string)} ${formatLabel(r.format as string)}: ${
        r[field]
      } average across ${r.posts} posts`,
      // Status only on the views chart. Judging engagement against a views
      // benchmark would be comparing two different things.
      status:
        field === 'avg_views'
          ? (() => {
              const st = formatStatus(r.avg_views as number, benchmark, r.posts as number);
              // Same colour, performance wording. A format is not urgent.
              // Both label forms have to be set: BarList renders compact, which
              // reads shortLabel, so overriding only `label` left the action
              // wording ("Good", "Attention") showing on the badge.
              return st
                ? {
                    ...st,
                    label: PERFORMANCE_LABEL[st.level],
                    shortLabel: PERFORMANCE_SHORT[st.level],
                  }
                : null;
            })()
          : undefined,
    }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Format Comparison"
        lead="Reels against carousels against plain posts, measured per post rather than in total. The badge judges each format against its own platform's average, because formats are only comparable within a platform. The bars share one scale across both platforms, so a full width bar means the same thing on either chart."
      />

      <StatusLegend scale="performance" />

      <Panel
        title="What you actually publish"
        description="Share of every synced post by format, across both platforms. Output mix, not performance."
      >
        <Donut
          data={formatSlices}
          valueLabel="Share of posts"
          centreLabel="posts"
          emptyMessage="No posts synced yet."
        />
      </Panel>

      <Panel
        title="Instagram, average views per post"
        description="The clearest signal you have. Instagram and Facebook are kept apart because their distribution works differently."
      >
        <BarList
          data={toBars(instagram, 'avg_views')}
          valueLabel="Average views per post"
          max={maxViews}
          emptyMessage="No Instagram posts synced yet."
        />
      </Panel>

      <Panel title="Instagram, average engagement per post">
        <BarList
          data={toBars(instagram, 'avg_engagement')}
          valueLabel="Average engagement per post"
          max={maxEngagement}
          emptyMessage="No Instagram posts synced yet."
        />
      </Panel>

      <Panel
        title="Facebook, average views per post"
        description="Reels against carousels against plain posts, the same comparison as Instagram."
      >
        <BarList
          data={toBars(facebook, 'avg_views')}
          valueLabel="Average views per post"
          max={maxViews}
          emptyMessage="No Facebook posts synced yet."
        />
      </Panel>

      <Panel title="Facebook, average engagement per post">
        <BarList
          data={toBars(facebook, 'avg_engagement')}
          valueLabel="Average engagement per post"
          max={maxEngagement}
          emptyMessage="No Facebook posts synced yet."
        />
        <Note>
          Facebook format comes from two signals, because the Page posts edge has no product type
          field. A Reel is identified by its /reel/ permalink, and a carousel by an album
          attachment. Instagram reports its formats directly. A format with fewer than three posts
          is left unjudged rather than coloured on a sample that small.
        </Note>
      </Panel>
    </div>
  );
}
