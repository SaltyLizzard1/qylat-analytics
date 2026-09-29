import { getSplits } from '@/lib/queries';
import { getFormatBenchmarkAtAge, getFormatPosts, type FormatAtAge, type FormatPost } from '@/lib/cohort';
import { parsePeriod, periodPhrase, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Panel, PageHeader, Empty, Disclosure } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { PostThumb } from '@/components/PostThumb';
import { Donut, type Slice } from '@/components/Donut';
import { formatStatus, THRESHOLDS, PERFORMANCE_SHORT, PERFORMANCE_LABEL } from '@/lib/status';
import { C, RADIUS, compact, shortDate, platformLabel, formatLabel, formatColor } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * Formats compared at the same age, with every post shown.
 *
 * The earlier version drew one bar per format from the average of lifetime
 * views. That number belonged to no post, hid a single large Reel behind
 * three small ones, and measured a two week old post against a two day old
 * one. The median at a fixed age is the honest single figure, and the posts
 * underneath show the spread it summarises.
 */
export default async function FormatsPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams>;
}) {
  const period = parsePeriod(await searchParams);
  const age = THRESHOLDS.formatAgeHours;
  const [benchmarks, posts, splits] = await Promise.all([
    getFormatBenchmarkAtAge(age, period),
    getFormatPosts(period, age),
    getSplits(period),
  ]);

  const formatSlices: Slice[] = splits.byFormat.map((r) => ({
    key: r.key as string,
    label: formatLabel(r.key as string),
    value: (r.value as number) ?? 0,
    color: formatColor(r.key as string),
  }));

  const platforms = ['instagram', 'facebook'] as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Format Comparison"
        meta={[
          { label: 'Measured at', value: `${age} hours old` },
          { label: 'Posts listed', value: String(posts.length) },
          { label: 'Window', value: period.label },
        ]}
      />

      <Disclosure summary="How a format gets judged, and why the median rather than the average">
        Reels against carousels against plain posts, each measured {age} hours after publishing so
        age is taken out of the comparison. A format{"'"}s median is judged against its own
        platform{"'"}s median at the same age, because formats are only comparable within a
        platform. Every post is listed under its format with its own figure, so the spread stays
        visible instead of being flattened into an average, which is what an earlier version did:
        one large Reel hid three small ones behind a mean that belonged to no post.
      </Disclosure>

      <PeriodPicker period={period} />

      <StatusLegend scale="performance" />

      <Panel
        title="What you actually publish"
        description={`Share of posts published ${periodPhrase(period)} by format, across both platforms. Output mix, not performance.`}
      >
        <Donut
          data={formatSlices}
          valueLabel="Share of posts"
          centreLabel="posts"
          emptyMessage="No posts synced yet."
        />
      </Panel>

      {platforms.map((platform) => (
        <PlatformPanel
          key={platform}
          platform={platform}
          age={age}
          windowPhrase={periodPhrase(period)}
          benchmarks={benchmarks.filter((b) => b.platform === platform)}
          posts={posts.filter((p) => p.platform === platform)}
        />
      ))}

      <Disclosure summary="Instagram under-counts images and carousels against its own app">
        Checked side by side on 19 Sept 2026: reels matched the app exactly, but an image the app
        showed at 430 views came back from the API as 105, and a carousel the app showed at 1,234
        came back as 106. The API agrees with itself, so the gap is a figure Meta does not expose.
        Reels are comparable with the app; images and carousels are under-counted here relative to
        reels, and reach is the fairer column for comparing those two.
      </Disclosure>

      <Disclosure summary="How a Facebook format is worked out, and when a format is left unjudged">
        Facebook format comes from two signals, because the Page posts edge has no product type
        field. A Reel is identified by its /reel/ permalink, and a carousel by an album attachment.
        Instagram reports its formats directly. A format with fewer than {THRESHOLDS.minSamplePosts}{' '}
        measurable posts is left unjudged rather than coloured on a sample that small.
      </Disclosure>
    </div>
  );
}

function PlatformPanel({
  platform,
  age,
  windowPhrase,
  benchmarks,
  posts,
}: {
  platform: string;
  age: number;
  /** Already a grammatical phrase, e.g. "in the last 7 days". See periodPhrase. */
  windowPhrase: string;
  benchmarks: FormatAtAge[];
  posts: FormatPost[];
}) {
  const platformMedian = benchmarks[0]?.platformMedian ?? null;
  const platformPosts = benchmarks[0]?.platformPosts ?? 0;

  // Formats in benchmark order first, then any format present only in the
  // post list, such as stories or formats too young to measure.
  const order = [
    ...benchmarks.sort((a, b) => b.medianViews - a.medianViews).map((b) => b.format),
    ...posts.map((p) => p.format).filter((f, i, all) => all.indexOf(f) === i),
  ].filter((f, i, all) => all.indexOf(f) === i);

  return (
    <Panel
      title={`${platformLabel(platform)}, views at ${age} hours by format`}
      description={
        platformMedian !== null
          ? `Posts published ${windowPhrase}. Platform median at ${age} hours: ${Math.round(platformMedian).toLocaleString()} views across ${platformPosts} measurable posts.`
          : `Posts published ${windowPhrase}. No post here is ${age} hours old with a snapshot that young, so there is no median yet.`
      }
    >
      {posts.length === 0 ? (
        <Empty message={`No ${platformLabel(platform)} posts in this window.`} />
      ) : (
        <div className="flex flex-col gap-4">
          {order.map((format) => {
            const bench = benchmarks.find((b) => b.format === format);
            const rows = posts.filter((p) => p.format === format);
            const base = bench ? formatStatus(bench.medianViews, bench.platformMedian, bench.posts, `the platform median at ${age} hours`) : null;
            const status = base
              ? { ...base, label: PERFORMANCE_LABEL[base.level], shortLabel: PERFORMANCE_SHORT[base.level] }
              : null;
            const empty = bench
              ? { label: 'Too few', reason: `${bench.posts} measurable ${bench.posts === 1 ? 'post' : 'posts'}, fewer than the ${THRESHOLDS.minSamplePosts} needed to judge` }
              : { label: 'No median', reason: `No post of this format is ${age} hours old with a snapshot that young` };

            return (
              <div key={format}>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: formatColor(format), flexShrink: 0 }} />
                  <span className="text-sm" style={{ fontWeight: 600, color: C.text }}>
                    {formatLabel(format)}
                  </span>
                  <StatusBadge status={status} compact empty={empty} />
                  <span className="text-xs" style={{ color: C.muted }}>
                    {bench
                      ? `median ${Math.round(bench.medianViews).toLocaleString()} views at ${age}h, ${bench.posts} of ${rows.length} measurable`
                      : `${rows.length} ${rows.length === 1 ? 'post' : 'posts'}, none measurable at ${age}h yet`}
                  </span>
                </div>

                <div
                  className="hidden sm:grid text-xs uppercase px-2 pb-1"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) 5rem 5rem 4.5rem 5.5rem', color: C.muted, letterSpacing: '0.08em' }}
                >
                  <span>Post</span>
                  <span className="text-right">At {age}h</span>
                  <span className="text-right">Lifetime</span>
                  <span className="text-right">Reach</span>
                  <span className="text-right">Engagement</span>
                </div>

                <ol className="flex flex-col">
                  {rows.map((p) => (
                    <PostRow key={p.id} post={p} age={age} />
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function PostRow({ post, age }: { post: FormatPost; age: number }) {
  const caption = (post.caption ?? '').replace(/\s+/g, ' ').trim() || 'Untitled post';
  const atAge =
    post.views_at_age !== null
      ? compact(post.views_at_age)
      : post.old_enough
        ? 'no snapshot'
        : `under ${age}h`;

  return (
    <li
      className="grid items-center gap-x-3 px-2 py-2"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr) 5rem 5rem 4.5rem 5.5rem',
        borderTop: `1px solid ${C.border}`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <PostThumb src={post.thumbnail_url} label={formatLabel(post.format)} />
        <div className="min-w-0">
          <p className="text-sm truncate" style={{ color: C.text }}>
            {post.permalink ? (
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" style={{ color: C.text, textDecoration: 'none' }}>
                {caption}
              </a>
            ) : (
              caption
            )}
          </p>
          <p className="text-xs" style={{ color: C.muted }}>
            {shortDate(post.published_at)}
          </p>
        </div>
      </div>
      <Cell strong={post.views_at_age !== null} muted={post.views_at_age === null}>
        {atAge}
      </Cell>
      <Cell>{compact(post.views)}</Cell>
      <Cell>{post.reach === null || post.reach === 0 ? '·' : compact(post.reach)}</Cell>
      <Cell>{compact(post.engagement)}</Cell>
    </li>
  );
}

function Cell({ children, strong = false, muted = false }: { children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <span
      className="text-right tabular-nums text-sm"
      style={{ color: muted ? C.muted : C.text, fontWeight: strong ? 600 : 400, fontSize: muted ? '0.72rem' : undefined, borderRadius: RADIUS.sm }}
    >
      {children}
    </span>
  );
}
