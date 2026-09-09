import { getPlatformComparison, getClicksByPlatform } from '@/lib/queries';
import { BarList, Panel, Note, type BarDatum } from '@/components/charts';
import { C, compact, platformLabel } from '@/lib/theme';

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Platform Comparison
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Which platform earns attention per post published, and which one actually sends clicks.
        </p>
      </div>

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th className="text-left text-xs uppercase tracking-widest font-normal px-2 py-2" style={{ color: C.muted }}>
                  Platform
                </th>
                {['Posts', 'Views', 'Avg views', 'Engagement'].map((h) => (
                  <th
                    key={h}
                    className="text-right text-xs uppercase tracking-widest font-normal px-2 py-2"
                    style={{ color: C.muted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platforms.map((r, i) => (
                <tr
                  key={r.platform as string}
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: i % 2 === 1 ? C.neutral : C.card,
                  }}
                >
                  <td className="px-2 py-2.5" style={{ color: C.text }}>
                    {platformLabel(r.platform as string)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C.text }}>
                    {r.posts as number}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C.text }}>
                    {compact(r.views as number)}
                  </td>
                  <td
                    className="px-2 py-2.5 text-right tabular-nums"
                    style={{ color: C.text, fontWeight: 600 }}
                  >
                    {compact(r.avg_views as number)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: C.text }}>
                    {compact(r.engagement as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
