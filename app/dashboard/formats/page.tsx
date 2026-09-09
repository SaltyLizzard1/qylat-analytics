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
          attachment. Instagram reports its formats directly.
        </Note>
      </Panel>
    </div>
  );
}
