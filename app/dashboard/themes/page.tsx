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
import { C, CARD, EYEBROW, RADIUS, TITLE, formatLabel, full, platformLabel, shortDate, tagColor } from '@/lib/theme';

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
 *   - how each tag's posts did, as the median views to date with the number of
 *     posts beside every bar.
 *
 * No tag is called the best one. Views here are totals to date for posts of
 * different ages, and a tag with a couple of posts is a small sample, which
 * is said beside the bar instead of being read as a result.
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
  const postsHref = (theme: string) => withPeriod(`/dashboard/posts?theme=${theme}&back=themes`, period);

  // How many posts carry each tag. Output, not performance.
  const taggedInStats = stats.reduce((n, s) => n + s.posts, 0);
  const mixBars: BarDatum[] = [...stats]
    .sort((a, b) => b.posts - a.posts)
    .map((s) => ({
      key: s.theme,
      label: pillarLabel(s.theme),
      value: s.posts,
      meta: taggedInStats > 0 ? `${Math.round((s.posts / taggedInStats) * 100)}% of tagged posts` : undefined,
      color: tagColor(s.theme),
      href: postsHref(s.theme),
      title: `${pillarLabel(s.theme)}: ${s.posts} post${s.posts === 1 ? '' : 's'}. Click for the posts`,
    }));

  // How each tag's posts did. A tag with no views figure at all is not drawn as zero.
  const performanceBars: BarDatum[] = stats
    .filter((s) => s.median_views !== null)
    .map((s) => {
      const count = s.views_known < s.posts ? `${s.views_known} of ${s.posts} posts` : `${s.posts} post${s.posts === 1 ? '' : 's'}`;
      return {
        key: s.theme,
        label: pillarLabel(s.theme),
        value: Math.round(s.median_views ?? 0),
        meta: s.views_known < THRESHOLDS.minSamplePosts ? `${count}, small sample` : count,
        color: tagColor(s.theme),
        href: postsHref(s.theme),
        title: `${pillarLabel(s.theme)}: median ${full(Math.round(s.median_views ?? 0))} views to date across ${count}. Click for the posts`,
      };
    });
  const noFigure = stats.filter((s) => s.median_views === null);
  const comparable = stats.filter((s) => s.views_known >= THRESHOLDS.minSamplePosts).length;

  const clickBars: BarDatum[] = both
    .filter((r) => (r.clicks as number) > 0)
    .map((r) => ({
      key: r.theme as string,
      label: pillarLabel(r.theme as string),
      value: (r.clicks as number) ?? 0,
      meta: `${r.links} link${r.links === 1 ? '' : 's'}`,
      color: tagColor(r.theme as string),
    }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Themes"
        meta={[
          { label: 'Tagged in this window', value: `${tagged} of ${windowed.total} posts` },
          { label: 'Untagged, all time', value: `${full(backlog.posts)} posts` },
          { label: 'Tags in use in this window', value: String(stats.length) },
        ]}
      />

      <FilterBar>
        <PeriodPicker period={period} bare />
      </FilterBar>

      <NeedsTagging posts={windowed.posts} untagged={windowed.untagged} total={windowed.total} backlog={backlog.posts} stories={backlog.stories} phrase={phrase} />

      {stats.length > 0 && (
        <>
          <SectionHeading note={`Median views to date per post · posts published ${phrase} · Instagram and Facebook Page · click a bar for its posts`}>
            How each tag&apos;s posts did
          </SectionHeading>
          <ChartCard
            title="Median views to date, by tag"
            note={
              comparable >= 2
                ? `${comparable} tags have at least ${THRESHOLDS.minSamplePosts} posts with a figure. Posts differ in age, so this is not a ranking`
                : `Fewer than two tags have ${THRESHOLDS.minSamplePosts} posts with a figure, so no tag is compared with another yet`
            }
            info="The middle post for each tag, by total views as of the last read, for posts published in the window. Posts of different ages and both accounts are mixed, and Instagram’s API reports fewer views for images and carousels than the app, so a longer bar is not proof that a tag works better. The number of posts is beside every bar. Stories are not counted."
          >
            <BarList
              data={performanceBars}
              valueLabel="Median views to date"
              emptyMessage="No tagged post in this window has a views figure yet."
            />
            {noFigure.length > 0 && (
              <p className="text-xs mt-3" style={{ color: C.muted }}>
                No views figure yet: {noFigure.map((s) => `${pillarLabel(s.theme)} (${s.posts})`).join(', ')}.
              </p>
            )}
          </ChartCard>

          <SectionHeading note={`Number of posts per tag · posts published ${phrase} · output, not performance`}>
            What you tagged
          </SectionHeading>
          <ChartCard
            title="Posts by tag"
            note={`${taggedInStats} tagged post${taggedInStats === 1 ? '' : 's'}${
              windowed.untagged > 0 ? `. ${windowed.untagged} more in this window have no tag, so the split is partial` : ''
            }`}
            info="How the tagged posts published in the window split across tags. It says what you published, and nothing about how it did. No target shares are set, so no split is judged. Stories are not counted."
          >
            <BarList data={mixBars} valueLabel="Posts" emptyMessage="No tagged posts in this window." />
          </ChartCard>
        </>
      )}

      <SectionHeading note={`Clicks by people ${phrase} · grouped by the tag on each /go/ link`}>Clicks by tag</SectionHeading>
      {clickBars.length === 0 ? (
        <p className="text-sm px-4 py-3" style={{ ...CARD, color: C.muted }}>
          No tagged /go/ link was clicked in this window. A link gets its tag when you create it.
        </p>
      ) : (
        <ChartCard
          title="Link clicks"
          info="Clicks on /go/ links that carry a tag, inside the window. Crawlers and your own test clicks are excluded. This side works without tagging any posts."
        >
          <BarList data={clickBars} valueLabel="Clicks" color={tagColor(clickBars[0].key)} />
        </ChartCard>
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
            Views are each post&apos;s total to date. Posts of different ages are mixed, so a tag whose posts are
            older has had longer to collect views.
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
                      <span>{p.views === null ? 'No views figure' : `${full(p.views)} views to date`}</span>
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
