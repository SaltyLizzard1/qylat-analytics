import { getFormatComparison } from '@/lib/queries';
import { BarList, Panel, Note, PageHeader, type BarDatum } from '@/components/charts';
import { StatusLegend } from '@/components/status';
import { formatStatus, PERFORMANCE_SHORT } from '@/lib/status';
import { platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function FormatsPage() {
  const rows = await getFormatComparison();

  const instagram = rows.filter((r) => r.platform === 'instagram');
  const facebook = rows.filter((r) => r.platform === 'facebook');

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
              return st ? { ...st, label: PERFORMANCE_SHORT[st.level] } : null;
            })()
          : undefined,
    }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Format Comparison"
        lead="Reels against carousels against plain posts, measured per post rather than in total. Each format is judged against its own platform's average, since formats are only comparable within a platform."
      />

      <StatusLegend scale="performance" />

      <Panel
        title="Instagram, average views per post"
        description="The clearest signal you have. Instagram and Facebook are kept apart because their distribution works differently."
      >
        <BarList
          data={toBars(instagram, 'avg_views')}
          valueLabel="Average views per post"
          emptyMessage="No Instagram posts synced yet."
        />
      </Panel>

      <Panel title="Instagram, average engagement per post">
        <BarList
          data={toBars(instagram, 'avg_engagement')}
          valueLabel="Average engagement per post"
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
          emptyMessage="No Facebook posts synced yet."
        />
      </Panel>

      <Panel title="Facebook, average engagement per post">
        <BarList
          data={toBars(facebook, 'avg_engagement')}
          valueLabel="Average engagement per post"
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
