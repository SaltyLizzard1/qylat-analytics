import Link from 'next/link';
import { parsePeriod, periodPhrase } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { getThemePerformance, getUntaggedPostCount, getPillarMix } from '@/lib/queries';
import { BarList, Panel, Empty, PageHeader, Disclosure, type BarDatum } from '@/components/charts';
import { DataRows, type Column } from '@/components/DataRows';
import { Donut, type Slice } from '@/components/Donut';
import type { Row } from '@/lib/queries';
import { StatusBadge, StatusLegend } from '@/components/status';
import { PILLARS, pillarLabel, HAS_TARGETS } from '@/lib/pillars';
import { C, compact, full, tagColor } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function ThemesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>;
}) {
  const period = parsePeriod(await searchParams);
  const [rows, untagged, mix] = await Promise.all([
    getThemePerformance(period),
    getUntaggedPostCount(),
    getPillarMix(period),
  ]);

  const clickBars: BarDatum[] = rows
    .filter((r) => (r.clicks as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: pillarLabel(r.theme as string),
      value: (r.clicks as number) ?? 0,
      meta: `${r.links} links`,
      color: tagColor(r.theme as string),
    }));

  const viewBars: BarDatum[] = rows
    .filter((r) => (r.views as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: pillarLabel(r.theme as string),
      value: (r.views as number) ?? 0,
      meta: `${r.posts} posts`,
      color: tagColor(r.theme as string),
    }));

  const tagSlices: Slice[] = mix.rows.map((r) => ({
    key: r.theme as string,
    label: pillarLabel(r.theme as string),
    value: (r.posts as number) ?? 0,
    color: tagColor(r.theme as string),
  }));

  const totalClicks = rows.reduce((n, r) => n + ((r.clicks as number) ?? 0), 0);

  const num = (key: string, label: string, width: string, bold = false): Column<Row> => ({
    key,
    label,
    align: 'right',
    width,
    bold,
    render: (r) => compact(r[key] as number),
  });

  const bothColumns: Column<Row>[] = [
    {
      key: 'theme',
      label: 'Theme',
      width: 'minmax(9rem, 1.6fr)',
      render: (r) => pillarLabel(r.theme as string),
    },
    num('posts', 'Posts', '4.5rem'),
    num('views', 'Views', '5rem'),
    num('engagement', 'Engagement', '6.5rem'),
    num('links', 'Links', '4.5rem'),
    num('clicks', 'Clicks', '5rem', true),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Content Theme Performance"
        meta={[
          { label: 'Tagged posts', value: `${mix.taggedPosts} of ${mix.totalPosts}` },
          { label: 'Themes seen', value: String(rows.length) },
          { label: 'Clicks', value: full(totalClicks) },
        ]}
      />

      <Disclosure summary="What a theme tag buys you">
        A tag is the only thing that joins what you published to what people clicked. Meta has no
        such field, so both sides are yours to fill in: the tag on a post drives the views half, the
        tag on a /go/ link drives the clicks half, and either works without the other.
      </Disclosure>

      <PeriodPicker period={period} />

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
          <>
          <div className="mb-6">
            <Donut data={tagSlices} valueLabel="Share of tagged posts" centreLabel="tagged" />
          </div>
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
                        background: tagColor(p.slug),
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
        <Disclosure summary={`Provisional: based on ${mix.taggedPosts} tagged posts of ${mix.totalPosts}`}>
          Until most posts are tagged, the mix reflects only what you have got round to tagging
          rather than what you actually published. It firms up as the untagged backlog clears.
        </Disclosure>
      </Panel>

      {untagged > 0 && (
        <Panel title="Tagging needed">
          <p className="text-sm mb-3" style={{ color: C.muted }}>
            <span style={{ color: C.text, fontWeight: 600 }}>{untagged} posts have no tag.</span>{' '}
            Meta has no such field, so this view only fills in once you tag posts yourself. The
            posts screen defaults to untagged and it is one click per post.
          </p>
          <Link
            href="/admin/posts"
            className="inline-block px-4 py-2 rounded-lg text-sm font-semibold"
            style={{
              background: C.text,
              color: C.onInk,
              border: `1px solid ${C.text}`,
              textDecoration: 'none',
            }}
          >
            Tag posts
          </Link>
        </Panel>
      )}

      <Panel
        title="Clicks by tag"
        description={`Clicks that happened ${periodPhrase(period)}, grouped by the tag on each /go/ link. This side works without tagging any posts.`}
      >
        <BarList
          data={clickBars}
          valueLabel="Clicks"
          emptyMessage="No link has a content theme yet. Set one when you create a /go/ link."
        />
      </Panel>

      <Panel
        title="Lifetime views by tag"
        description={`Posts published ${periodPhrase(period)}, lifetime views as of today, grouped by the tag on each post.`}
      >
        <BarList
          data={viewBars}
          valueLabel="Views"
          emptyMessage="No post has been tagged with a theme yet."
        />
      </Panel>

      <Panel title="Both sides together">
        <DataRows
          columns={bothColumns}
          rows={rows}
          keyOf={(r) => r.theme as string}
          emptyMessage="Nothing to show until a theme exists on a link or a post."
        />
        <Disclosure summary="Why a row can have posts but no clicks">
          A theme can appear with posts but no links, or links but no clicks. That is not an error,
          it means one side has been filled in and the other has not.
        </Disclosure>
      </Panel>
    </div>
  );
}
