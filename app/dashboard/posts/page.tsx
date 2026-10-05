import { parsePeriod, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PlatformFilter } from '@/components/PlatformFilter';
import { getDetailPosts, parsePlatform, parseWeek, withFilters, type DetailPost } from '@/lib/overview';
import { PageHeader, Disclosure, Empty } from '@/components/charts';
import { BackLink, DateTile, SampleChip } from '@/components/overview';
import { Sub } from '@/components/DataRows';
import { PostThumb } from '@/components/PostThumb';
import { THRESHOLDS } from '@/lib/status';
import { C, CARD, RADIUS, formatLabel, full, platformColor, platformLabel, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * The posts behind a mark on the Overview: one publish week, one account, or
 * the whole window. Opened by clicking a bar, a card or an account, and
 * carrying the same period and account filters back and forth.
 *
 * Each row is recognisable before it is read: the thumbnail, then the first
 * line of the caption. Figures are each post's total to date. A post with no
 * figure says so, and is never shown as zero.
 */

const CAPTION_CHARS = 90;

/** The first line of a caption, cut by code point so an emoji is never split. */
function shortCaption(p: DetailPost): string {
  const first = (p.caption ?? '').split('\n').find((l) => l.trim()) ?? '';
  const chars = Array.from(first.trim());
  if (chars.length === 0) return 'No caption';
  return chars.length > CAPTION_CHARS ? `${chars.slice(0, CAPTION_CHARS).join('')}...` : chars.join('');
}

function figure(v: number | null): React.ReactNode {
  return v === null ? <span style={{ color: C.muted, fontWeight: 400 }}>No figure</span> : full(v);
}

/**
 * One post. A list of wrapping rows, not a table: on a phone the three figures
 * drop under the caption, each with its own label, instead of sliding off the
 * right edge where a table would put them.
 */
function PostRow({ p }: { p: DetailPost }) {
  // "23 Sept", in the dashboard's timezone, for the tile that stands in for a
  // missing image.
  const [day, month = ''] = shortDate(p.published_at).split(' ');
  const identity = (
    <span className="flex items-center gap-3 min-w-0">
      <PostThumb
        src={p.thumbnail_url}
        // Meta can reissue an expired link for Instagram and the Page. The
        // profile has no API and no stored image, so it goes straight to the
        // date tile.
        recoverSrc={p.platform === 'facebook-personal' ? undefined : `/api/thumb/${p.id}`}
        label={platformLabel(p.platform)}
        size={48}
        fallback={
          <DateTile
            day={day}
            month={month}
            color={platformColor(p.platform)}
            title={
              p.platform === 'facebook-personal'
                ? `Published ${day} ${month}. The collector does not read Facebook Profile images`
                : `Published ${day} ${month}. No image could be loaded for this post`
            }
          />
        }
      />
      <span className="min-w-0">
        <span className="block text-sm" style={{ color: C.text, overflowWrap: 'anywhere' }}>
          {shortCaption(p)}
        </span>
        <Sub>
          <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span
              aria-hidden
              style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: platformColor(p.platform) }}
            />
            {platformLabel(p.platform)}
            {p.format ? ` · ${formatLabel(p.format)}` : ''}
            {' · '}
            {p.published_label ? `${p.published_label}, as Facebook displayed it` : shortDateTime(p.published_at)}
          </span>
        </Sub>
      </span>
    </span>
  );
  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}
    >
      <div className="min-w-0" style={{ flex: '1 1 260px' }}>
        {p.permalink ? (
          <a href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} title="Open the post">
            {identity}
          </a>
        ) : (
          identity
        )}
      </div>
      <dl className="grid grid-cols-3 gap-x-5 text-right" style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
        {(
          [
            ['Views', p.views],
            ['Engagement', p.engagement],
            ['Comments', p.comments],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.06em', fontSize: '0.62rem' }}>
              {label}
            </dt>
            <dd className="text-sm tabular-nums" style={{ color: C.text, fontWeight: 600 }}>
              {figure(value)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export default async function PostsDetailPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string; week?: string; origin?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const platform = parsePlatform(sp.platform);
  const week = parseWeek(sp.week);
  const posts = await getDetailPosts(period, platform, week);
  // Clicking a bar narrows this view to one account. The way back returns to
  // the Overview with the account filter it had before the click.
  const backPlatform = sp.origin === 'all' ? 'all' : platform;

  const account = platform === 'all' ? 'All accounts' : platformLabel(platform);
  const weekEnd = week ? new Date(new Date(`${week}T00:00:00Z`).getTime() + 6 * 86_400_000) : null;
  const scope =
    week && weekEnd
      ? `published ${shortDate(week)} to ${shortDate(weekEnd)}`
      : `published in ${period.label.toLowerCase()}`;
  const reads = posts.map((p) => p.read_at).filter(Boolean) as string[];
  const lastRead = reads.length ? reads.reduce((a, b) => (a > b ? a : b)) : null;
  const withViews = posts.filter((p) => p.views !== null).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <BackLink href={withFilters('/dashboard', period, backPlatform)}>Back to Overview</BackLink>
        {week && (
          <BackLink href={withFilters('/dashboard/posts', period, platform, { origin: sp.origin === 'all' ? 'all' : undefined })}>
            All weeks in this window
          </BackLink>
        )}
      </div>

      <PageHeader
        title={`${account}: posts ${scope}`}
        meta={[
          // The window chosen on the Overview, always shown, so a narrowed
          // week is never mistaken for the whole selection.
          {
            label: 'Publication window',
            value: `${period.label}, ${shortDate(period.startDate)} to ${shortDate(period.endDate)}`,
          },
          ...(week && weekEnd
            ? [{ label: 'Publish week shown', value: `${shortDate(week)} to ${shortDate(weekEnd)}` }]
            : []),
          { label: 'Posts', value: String(posts.length) },
          { label: 'With a views figure', value: `${withViews} of ${posts.length}` },
          { label: 'Figures read', value: lastRead ? shortDateTime(lastRead) : 'never' },
        ]}
      />

      <div className="px-4 py-3 flex flex-col gap-2.5" style={CARD}>
        <PeriodPicker period={period} />
        <PlatformFilter current={platform} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
        Views and engagement are each post&apos;s total to date, not activity inside the window. Highest views
        first.
        {posts.length > 0 && posts.length < THRESHOLDS.minSamplePosts && <SampleChip>small sample</SampleChip>}
      </div>

      {posts.length === 0 ? (
        <Empty message="No posts match these filters. Try a longer period or another account." />
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((p) => (
            <PostRow key={`${p.platform}-${p.id}`} p={p} />
          ))}
        </ul>
      )}

      <Disclosure summary="About these figures">
        <ul className="space-y-2">
          <li>
            Instagram and Facebook Page figures are the latest daily reading from Meta&apos;s API. Facebook Profile
            figures are the latest reading of Facebook&apos;s Content Library, and its Engagement also counts clicks.
          </li>
          <li>
            Posts of different ages are listed together, so an older post has had longer to collect views. For a
            comparison at the same age, use Recent.
          </li>
          <li>
            A post image that has expired is fetched again from Meta when the page needs it. Where none can be
            shown, a tile with the publish date stands in. Facebook Profile posts always show the tile, because the
            collector does not read images.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}
