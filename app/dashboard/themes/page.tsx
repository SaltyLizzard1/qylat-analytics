import Link from 'next/link';
import { parsePeriod, periodPhrase, withPeriod, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { getThemePerformance } from '@/lib/queries';
import { getThemeStats, getUntaggedBacklog, getUntaggedInWindow, type UntaggedPost } from '@/lib/themes';
import { BarList, PageHeader, SectionHeading, Disclosure, type BarDatum } from '@/components/charts';
import { ChartCard, FilterBar, PlatformChip, PostPicture, QuietChip } from '@/components/overview';
import { QuickTag } from '@/components/QuickTag';
import { PILLARS, pillarLabel } from '@/lib/pillars';
import { THRESHOLDS } from '@/lib/status';
import { C, CARD, EYEBROW, RADIUS, TITLE, formatLabel, full, platformColor, platformLabel, shortDate, tagColor } from '@/lib/theme';

/** The accounts that carry tags, each charted on its own. */
const ACCOUNTS = ['instagram', 'facebook'] as const;

export const dynamic = 'force-dynamic';

/**
 * Themes: what still needs a tag, how the tagged posts split, and how each
 * tag's posts did.
 *
 * Three things are kept apart on purpose:
 *   - the posts in the selected window that have no tag, against the backlog
 *     of every untagged post ever synced. Two counts, two labels.
 *   - how many posts carry each tag, which is output and says nothing about
 *     how they did.
 *   - each tag's median lifetime views so far, one chart per account, with
 *     the number of posts beside every bar.
 *
 * The views charts are current totals for posts of different ages, not an
 * age-matched comparison, and say so in the heading and above the bars. No
 * tag is ranked or called ahead here, and nothing from this page feeds the
 * Overview's summary. Instagram and the Page read views differently, so
 * their posts are never pooled.
 *
 * Tags live on Instagram and Facebook Page posts. The Facebook Profile has no
 * tags, so nothing on this page counts or judges it.
 */

/** The first line of a caption, cut by code point so an emoji is never split. */
function oneLine(caption: string | null, max = 80): string {
  const first = (caption ?? '').split('\n').find((l) => l.trim()) ?? '';
  const chars = Array.from(first.trim());
  if (chars.length === 0) return 'No caption';
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : chars.join('');
}

export default async function ThemesPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const period = parsePeriod(await searchParams);
  const [windowed, backlog, stats, both] = await Promise.all([
    getUntaggedInWindow(period),
    getUntaggedBacklog(),
    getThemeStats(period),
    getThemePerformance(period),
  ]);

  const tagged = windowed.total - windowed.untagged;
  const phrase = periodPhrase(period);
  const postsHref = (theme: string, platform?: string) =>
    withPeriod(`/dashboard/posts?theme=${theme}${platform ? `&platform=${platform}` : ''}&back=themes`, period);

  // How many posts carry each tag, both accounts together. A count of posts
  // means the same thing on either account. Output, not performance.
  const byTag = new Map<string, number>();
  for (const s of stats) byTag.set(s.theme, (byTag.get(s.theme) ?? 0) + s.posts);
  const taggedInStats = [...byTag.values()].reduce((n, v) => n + v, 0);
  const mixBars: BarDatum[] = [...byTag.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([theme, posts]) => ({
      key: theme,
      label: pillarLabel(theme),
      value: posts,
      meta: `${Math.round((posts / taggedInStats) * 100)}% of tagged posts`,
      color: tagColor(theme),
      href: postsHref(theme),
      title: `${pillarLabel(theme)}: ${posts} post${posts === 1 ? '' : 's'}. Click for the posts`,
    }));

  // Views by tag, one chart per account. Instagram and the Page do not read
  // views the same way, so their posts are never pooled into one median. A
  // tag with no views figure at all is listed, not drawn as zero.
  const accounts = ACCOUNTS.map((platform) => {
    const rows = stats.filter((s) => s.platform === platform);
    const bars: BarDatum[] = rows
      .filter((s) => s.median_views !== null)
      .map((s) => {
        const count = s.views_known < s.posts ? `${s.views_known} of ${s.posts} posts` : `${s.posts} post${s.posts === 1 ? '' : 's'}`;
        return {
          key: s.theme,
          label: pillarLabel(s.theme),
          value: Math.round(s.median_views ?? 0),
          meta: s.views_known < THRESHOLDS.minSamplePosts ? `${count}, small sample` : count,
          color: tagColor(s.theme),
          href: postsHref(s.theme, platform),
          title: `${pillarLabel(s.theme)} on ${platformLabel(platform)}: median ${full(
            Math.round(s.median_views ?? 0)
          )} lifetime views so far across ${count}, posts of different ages. Click for the posts`,
        };
      });
    return { platform, rows, bars, noFigure: rows.filter((s) => s.median_views === null) };
  });

  const clickRows = both
    .filter((r) => (r.clicks as number) > 0)
    .map((r) => ({ theme: r.theme as string, clicks: (r.clicks as number) ?? 0, links: (r.links as number) ?? 0 }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Themes"
        meta={[
          { label: 'Tagged in this window', value: `${tagged} of ${windowed.total} posts` },
          { label: 'Untagged, all time', value: `${full(backlog.posts)} posts` },
          { label: 'Tags in use in this window', value: String(byTag.size) },
        ]}
      />

      <FilterBar>
        <PeriodPicker period={period} bare />
      </FilterBar>

      <NeedsTagging posts={windowed.posts} untagged={windowed.untagged} total={windowed.total} backlog={backlog.posts} stories={backlog.stories} phrase={phrase} />

      {stats.length > 0 && (
        <>
          <SectionHeading note={`Lifetime views so far · current totals, not matched by age · posts published ${phrase} · one chart per account`}>
            Views by tag
          </SectionHeading>
          <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.text }}>
            <span style={{ fontWeight: 700 }}>Not an age-matched comparison.</span>{' '}
            <span style={{ color: C.muted }}>
              Each bar is the middle post&apos;s lifetime views as they stand today. A tag whose posts are older has
              had longer to collect views, so a longer bar does not show that a tag performs better. Open a bar to
              see each post with its publish date.
            </span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accounts.map((a) => (
              <ChartCard
                key={a.platform}
                title={`${platformLabel(a.platform)}: median lifetime views so far, by tag`}
                swatch={platformColor(a.platform)}
                note="Current totals for posts of different ages. Click a bar for its posts"
                info={
                  a.platform === 'instagram'
                    ? 'The middle Instagram post for each tag, by lifetime views as of the last read from Meta’s API, for posts published in the window. Posts of different ages are mixed. Instagram’s API also reports fewer views for images and carousels than the app does. The number of posts is beside every bar. Stories are not counted.'
                    : 'The middle Facebook Page post for each tag, by lifetime views as of the last read from Meta’s API, for posts published in the window. Posts of different ages are mixed. The number of posts is beside every bar. Stories are not counted.'
                }
              >
                <BarList
                  data={a.bars}
                  valueLabel="Median lifetime views so far"
                  emptyMessage={
                    a.rows.length === 0
                      ? `No tagged ${platformLabel(a.platform)} post was published in this window.`
                      : `No tagged ${platformLabel(a.platform)} post in this window has a views figure yet.`
                  }
                />
                {a.noFigure.length > 0 && (
                  <p className="text-xs mt-3" style={{ color: C.muted }}>
                    No views figure yet: {a.noFigure.map((s) => `${pillarLabel(s.theme)} (${s.posts})`).join(', ')}.
                  </p>
                )}
              </ChartCard>
            ))}
          </div>

          <SectionHeading note={`Number of posts per tag · posts published ${phrase} · both accounts · output, not performance`}>
            What you tagged
          </SectionHeading>
          <ChartCard
            title="Posts by tag"
            note={`${taggedInStats} tagged post${taggedInStats === 1 ? '' : 's'}${
              windowed.untagged > 0 ? `. ${windowed.untagged} more in this window have no tag, so the split is partial` : ''
            }`}
            info="How the tagged posts published in the window split across tags, Instagram and the Facebook Page together. It says what you published, and nothing about how it did. No target shares are set, so no split is judged. Stories are not counted."
          >
            <BarList data={mixBars} valueLabel="Posts" emptyMessage="No tagged posts in this window." />
          </ChartCard>
        </>
      )}

      <SectionHeading note={`Clicks by people ${phrase} · grouped by the tag on each /go/ link`}>Clicks by tag</SectionHeading>
      {clickRows.length === 0 ? (
        <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.muted }}>
          No tagged /go/ link was clicked in this window. A link gets its tag when you create it.
        </p>
      ) : (
        /* A plain list, not bars: no screen lists the links or clicks for one
           tag, so nothing here should look like it opens one. */
        <dl className="px-4 py-1" style={CARD}>
          {clickRows.map((r, i) => (
            <div
              key={r.theme}
              className="flex items-baseline justify-between gap-3 py-2.5"
              style={{ borderTop: i > 0 ? `1px solid ${C.neutral}` : undefined }}
            >
              <dt className="flex items-center gap-2 text-sm min-w-0" style={{ color: C.text, fontWeight: 600 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: tagColor(r.theme), flexShrink: 0 }} />
                {pillarLabel(r.theme)}
              </dt>
              <dd className="text-sm tabular-nums" style={{ color: C.muted }}>
                <span style={{ color: C.text, fontWeight: 800 }}>{full(r.clicks)}</span> click{r.clicks === 1 ? '' : 's'} on{' '}
                {full(r.links)} link{r.links === 1 ? '' : 's'}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <Disclosure summary="How tags work, and what this page cannot see">
        <ul className="space-y-2">
          <li>
            A tag is the only thing that joins what you published to what people clicked. Meta has no such field,
            so a post gets its tag here or on the admin posts screen, and a /go/ link gets its tag when it is
            created. Either side works without the other.
          </li>
          <li>
            The tags are {PILLARS.map((p) => p.label).join(', ')}. Hover a tag button to see what it covers.
          </li>
          <li>
            Views are each post&apos;s lifetime total so far. Posts of different ages are mixed, so nothing here is
            an age-matched comparison, and no tag is ranked against another.
          </li>
          <li>
            Clicks by tag are counts only. Individual links and clicks are on the admin Links and Click Log
            screens, which cannot be filtered by tag.
          </li>
          <li>
            Facebook Profile posts have no tags and are not counted on this page.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

/**
 * What still needs a tag. The window's count leads, since that is what the
 * rest of the page is waiting on, and the all time backlog sits beside it
 * under its own label so the two are never read as one number.
 */
function NeedsTagging({
  posts,
  untagged,
  total,
  backlog,
  stories,
  phrase,
}: {
  posts: UntaggedPost[];
  untagged: number;
  total: number;
  backlog: number;
  /** Untagged stories, which the admin screen lists and this page does not. */
  stories: number;
  phrase: string;
}) {
  const elsewhere = Math.max(backlog - untagged, 0);
  return (
    <section className="p-4" style={CARD} aria-label="Posts that need a tag">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p style={EYEBROW}>Need a tag · published {phrase}</p>
            <p className="tabular-nums" style={{ ...TITLE, fontWeight: 800, fontSize: '2rem', lineHeight: 1.1 }}>
              {full(untagged)}{' '}
              <span className="text-sm" style={{ color: C.muted, fontWeight: 500, letterSpacing: 0 }}>
                of {full(total)} post{total === 1 ? '' : 's'}
              </span>
            </p>
          </div>
          <div>
            <p style={EYEBROW}>Untagged backlog · all time</p>
            <p className="tabular-nums" style={{ ...TITLE, fontWeight: 800, fontSize: '2rem', lineHeight: 1.1 }}>
              {full(backlog)}{' '}
              <span className="text-sm" style={{ color: C.muted, fontWeight: 500, letterSpacing: 0 }}>
                {elsewhere > 0 ? `${full(elsewhere)} outside this window` : 'all in this window'}
              </span>
            </p>
          </div>
        </div>
        {backlog + stories > 0 && (
          <Link
            href="/admin/posts"
            className="text-sm px-3.5 py-2"
            style={{ background: C.ink, color: C.onInk, borderRadius: RADIUS.pill, fontWeight: 700, textDecoration: 'none' }}
          >
            Open the full backlog
          </Link>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm mt-3" style={{ color: C.muted }}>
          No Instagram or Facebook Page post was published {phrase}.
        </p>
      ) : untagged === 0 ? (
        <p className="text-sm mt-3" style={{ color: C.text, fontWeight: 600 }}>
          Every post published {phrase} has a tag.
        </p>
      ) : (
        <>
          <p className="text-xs mt-3 mb-1" style={{ color: C.muted }}>
            Press a tag to save it. Newest first
            {untagged > posts.length ? `, showing ${posts.length} of ${untagged}` : ''}. Stories are not listed
            {stories > 0 ? `: ${full(stories)} untagged ${stories === 1 ? 'story is' : 'stories are'} on the admin screen` : ''}.
          </p>
          <ul className="flex flex-col">
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3"
                style={{ borderTop: `1px solid ${C.neutral}` }}
              >
                <div className="flex items-center gap-3 min-w-0" style={{ flex: '1 1 260px' }}>
                  <PostPicture id={p.id} platform={p.platform} src={p.thumbnail_url} publishedAt={p.published_at} label={platformLabel(p.platform)} size={48} />
                  <div className="min-w-0">
                    <p className="text-sm truncate" style={{ color: C.text, fontWeight: 600 }}>
                      {p.permalink ? (
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer" style={{ color: C.text, textDecoration: 'none' }} title="Open the post">
                          {oneLine(p.caption)}
                        </a>
                      ) : (
                        oneLine(p.caption)
                      )}
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5 mt-1 text-xs" style={{ color: C.muted }}>
                      <PlatformChip platform={p.platform} />
                      {p.format && <QuietChip>{formatLabel(p.format)}</QuietChip>}
                      <span>{shortDate(p.published_at)}</span>
                      <span>{p.views === null ? 'No views figure' : `${full(p.views)} lifetime views so far`}</span>
                    </p>
                  </div>
                </div>
                <div style={{ flex: '1 1 300px' }}>
                  <QuickTag postId={p.id} about={oneLine(p.caption, 40)} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
