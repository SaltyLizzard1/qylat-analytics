import Link from 'next/link';
import { getThemePerformance, getUntaggedPostCount, getPillarMix } from '@/lib/queries';
import { BarList, Panel, Empty, Note, PageHeader, type BarDatum } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { PILLARS, pillarLabel, HAS_TARGETS } from '@/lib/pillars';
import { C, compact } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function ThemesPage() {
  const [rows, untagged, mix] = await Promise.all([
    getThemePerformance(),
    getUntaggedPostCount(),
    getPillarMix(),
  ]);

  const clickBars: BarDatum[] = rows
    .filter((r) => (r.clicks as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: pillarLabel(r.theme as string),
      value: (r.clicks as number) ?? 0,
      meta: `${r.links} links`,
    }));

  const viewBars: BarDatum[] = rows
    .filter((r) => (r.views as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: pillarLabel(r.theme as string),
      value: (r.views as number) ?? 0,
      meta: `${r.posts} posts`,
    }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Content Theme Performance"
        lead="Which pillars earn attention and which ones actually send people to the site. Themes join your posts to your /go/ links, and to the pillar mix you are aiming for."
      />

      <StatusLegend />

      <Panel
        title={HAS_TARGETS ? 'Tag mix, published against target' : 'Tag mix'}
        description={
          HAS_TARGETS
            ? 'Your tags carry target shares of output. This says whether what you published matches, which performance figures alone cannot tell you.'
            : 'How your published posts split across the four tags. No target shares are set, so this reports the distribution and makes no judgement about it. Give me target percentages and it will start comparing.'
        }
      >
        {mix.taggedPosts === 0 ? (
          <Empty message="No posts tagged yet, so there is no mix to compare." />
        ) : (
          <div className="flex flex-col gap-3.5">
            {PILLARS.map((p) => {
              const row = mix.rows.find((r) => r.theme === p.slug);
              const posts = (row?.posts as number) ?? 0;
              const actual = mix.taggedPosts > 0 ? posts / mix.taggedPosts : 0;
              const target = p.targetShare;
              // Only judge drift when a target exists. Without one there is
              // nothing to be off, and a badge would be inventing an opinion.
              const drift = typeof target === 'number' ? actual - target : null;
              const level =
                drift === null
                  ? null
                  : Math.abs(drift) <= 0.1
                    ? 'good'
                    : Math.abs(drift) <= 0.2
                      ? 'warning'
                      : 'bad';
              return (
                <div key={p.slug} title={p.covers}>
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate" style={{ color: C.text }}>
                        {p.label}
                      </span>
                      {level && typeof target === 'number' && (
                        <StatusBadge
                          status={{
                            level,
                            label:
                              level === 'good'
                                ? 'On target'
                                : (drift as number) > 0
                                  ? 'Over target'
                                  : 'Under target',
                            reason: `${(actual * 100).toFixed(0)}% published against a ${(
                              target * 100
                            ).toFixed(0)}% target, from ${posts} of ${mix.taggedPosts} tagged posts`,
                          }}
                          compact
                        />
                      )}
                    </span>
                    <span className="text-xs tabular-nums flex-shrink-0" style={{ color: C.muted }}>
                      {posts} {posts === 1 ? 'post' : 'posts'}
                      <span style={{ color: C.border }}> / </span>
                      {(actual * 100).toFixed(0)}%
                      {typeof target === 'number' && (
                        <>
                          <span style={{ color: C.border }}> / </span>
                          target {(target * 100).toFixed(0)}%
                        </>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 6 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(actual * 100, 100)}%`,
                        background: C.text,
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Note>
          Based on {mix.taggedPosts} tagged posts out of {mix.totalPosts}. Until most posts are
          tagged the mix reflects only what you have got round to, not what you published, so read
          it as provisional.
        </Note>
      </Panel>

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
                      {pillarLabel(r.theme as string)}
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
