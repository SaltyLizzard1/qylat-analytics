import Link from 'next/link';
import { getThemePerformance, getUntaggedPostCount } from '@/lib/queries';
import { BarList, Panel, Empty, Note, type BarDatum } from '@/components/charts';
import { C, compact } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  const [rows, untagged] = await Promise.all([getThemePerformance(), getUntaggedPostCount()]);

  const clickBars: BarDatum[] = rows
    .filter((r) => (r.clicks as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: r.theme as string,
      value: (r.clicks as number) ?? 0,
      meta: `${r.links} links`,
    }));

  const viewBars: BarDatum[] = rows
    .filter((r) => (r.views as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: r.theme as string,
      value: (r.views as number) ?? 0,
      meta: `${r.posts} posts`,
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl mb-1" style={{ fontWeight: 600, color: C.text }}>
          Content Theme Performance
        </h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Which topics earn attention and which ones actually send people to the site. Themes join
          your posts to your /go/ links.
        </p>
      </div>

      {untagged > 0 && (
        <Panel title="Tagging needed">
          <p className="text-sm mb-3" style={{ color: C.muted }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{untagged} posts have no theme.</span>{' '}
            Meta has no theme field, so this view only fills in once you tag posts yourself. Tagging
            is a dropdown per post and takes a few seconds each.
          </p>
          <Link
            href="/admin/posts"
            className="inline-block px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: C.text,
              color: C.page,
              border: `1px solid ${C.text}`,
              textDecoration: 'none',
            }}
          >
            Tag posts
          </Link>
        </Panel>
      )}

      <Panel
        title="Clicks by theme"
        description="From the theme recorded on each /go/ link. This side works without tagging any posts."
      >
        <BarList
          data={clickBars}
          valueLabel="Clicks"
          emptyMessage="No link has a content theme yet. Set one when you create a /go/ link."
        />
      </Panel>

      <Panel
        title="Views by theme"
        description="From the theme you tag on each synced post."
      >
        <BarList
          data={viewBars}
          valueLabel="Views"
          emptyMessage="No post has been tagged with a theme yet."
        />
      </Panel>

      <Panel title="Both sides together">
        {rows.length === 0 ? (
          <Empty message="Nothing to show until a theme exists on a link or a post." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th
                    className="text-left text-xs uppercase tracking-widest font-normal px-2 py-2"
                    style={{ color: C.muted }}
                  >
                    Theme
                  </th>
                  {['Posts', 'Views', 'Engagement', 'Links', 'Clicks'].map((h) => (
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
                {rows.map((r, i) => (
                  <tr
                    key={r.theme as string}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      background: i % 2 === 1 ? C.neutral : C.card,
                    }}
                  >
                    <td className="px-2 py-2.5" style={{ color: C.text }}>
                      {r.theme as string}
                    </td>
                    {(['posts', 'views', 'engagement', 'links', 'clicks'] as const).map((k) => (
                      <td
                        key={k}
                        className="px-2 py-2.5 text-right tabular-nums"
                        style={{ color: C.text, fontWeight: k === 'clicks' ? 600 : 400 }}
                      >
                        {compact(r[k] as number)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          A theme can appear with posts but no links, or links but no clicks. That is not an error,
          it means one side has been filled in and the other has not.
        </Note>
      </Panel>
    </div>
  );
}
