import { getFormatComparison } from '@/lib/queries';
import { BarList, Panel, Note, type BarDatum } from '@/components/charts';
import { C, platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function FormatsPage() {
  const rows = await getFormatComparison();

  const instagram = rows.filter((r) => r.platform === 'instagram');
  const facebook = rows.filter((r) => r.platform === 'facebook');

  const toBars = (list: typeof rows, field: 'avg_views' | 'avg_engagement'): BarDatum[] =>
    list.map((r) => ({
      key: `${r.platform}-${r.format}`,
      label: formatLabel(r.format as string),
      value: (r[field] as number) ?? 0,
      meta: `${r.posts} posts`,
      title: `${platformLabel(r.platform as string)} ${formatLabel(r.format as string)}: ${r[field]} average across ${r.posts} posts`,
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Format Comparison
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Reels against carousels against plain posts, measured per post rather than in total.
        </p>
      </div>

      <Panel
        title="Instagram, average views per post"
        description="The clearest signal you have. Formats are only comparable within a platform, so Instagram and Facebook are kept apart."
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
        description="Facebook Page posts all arrive as a single format."
      >
        <BarList
          data={toBars(facebook, 'avg_views')}
          valueLabel="Average views per post"
          emptyMessage="No Facebook posts synced yet."
        />
        <Note>
          The Page posts edge does not report whether a Facebook post is a Reel, so everything from
          Facebook lands as one format. Splitting it needs the video reels edge, which is not built.
          Instagram formats are exact.
        </Note>
      </Panel>
    </div>
  );
}
