import Link from 'next/link';
import { getWeeklyClicks } from '@/lib/queries';
import { parsePeriod, type Period, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PlatformFilter } from '@/components/PlatformFilter';
import { getAttentionItems, type AttentionItem } from '@/lib/attention';
import {
  SOCIAL_PLATFORMS,
  getFollowerSeries,
  getFreshness,
  getPlatformTotals,
  getWebsiteTraffic,
  getWeeklySocial,
  parsePlatform,
  withFilters,
  type PlatformFilter as PlatformChoice,
  type SocialPlatform,
  type WeekRow,
} from '@/lib/overview';
import { BarList, PageHeader, SectionHeading, Disclosure } from '@/components/charts';
import {
  CardLine,
  Change,
  ChartCard,
  ChartEmpty,
  ColumnChart,
  FilterBar,
  MetricCard,
  MiniTrend,
  SampleChip,
} from '@/components/overview';
import { InfoTip } from '@/components/InfoTip';
import { StatusBadge } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { THRESHOLDS, type Level } from '@/lib/status';
import { C, CARD, RADIUS, full, platformColor, platformLabel, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * The Overview: how the social accounts are doing, readable in a few seconds,
 * with every chart a way into the posts behind it.
 *
 * Order, top to bottom: the filters, a row of figures, then charts, then the
 * list of things that need a look. The charts are the page. The list sits
 * below them because it is for after you have seen the shape of things.
 *
 * What this page will not do, however useful it would look:
 *   - draw "views this week". Views are stored as each post's total to date,
 *     so the charts show the posts published in a week and their totals as
 *     of the last read, and say so.
 *   - show a change for views or engagement. Posts of different ages are not
 *     comparable, and the profile's figures have an unverified scope.
 *   - add website sessions to social views, or one account's followers to
 *     another's. Each account and the website keep their own figures.
 */

const LEVEL_STYLE: Record<Level, { color: string; background: string; border: string }> = {
  good: severityGood,
  warning: severityWarning,
  bad: severityBad,
};

const VIEWS_INFO =
  'Each post’s total views as of the last read, added up for posts published in this window. Not views that happened in the window: only totals to date are stored. Older posts have had longer to collect views.';
const ENGAGEMENT_INFO =
  'Each post’s total engagement as of the last read, for posts published in this window. Instagram and the Page report likes, comments, saves and shares. The profile reports Facebook’s own Engagement figure, which also counts clicks.';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const platform = parsePlatform(sp.platform);
  const shown: SocialPlatform[] = platform === 'all' ? [...SOCIAL_PLATFORMS] : [platform];
  const single = shown.length === 1;

  const [weekly, totals, followers, website, weeklyClicks, attention, fresh] = await Promise.all([
    getWeeklySocial(period, platform),
    getPlatformTotals(period),
    getFollowerSeries(period),
    getWebsiteTraffic(period),
    getWeeklyClicks(period),
    getAttentionItems(period),
    getFreshness(),
  ]);

  const link = (href: string, extra: Record<string, string | undefined> = {}) =>
    withFilters(href, period, platform, extra);
  const comparing = period.compare === 'previous';

  const mine = totals.filter((t) => shown.includes(t.platform));
  const posts = mine.reduce((n, t) => n + t.posts, 0);
  // The profile is only collected for the last 28 days, so how many posts it
  // had in the window before is not known. Comparing against zero would
  // report growth that is only the collector starting. The comparison is made
  // on the two accounts whose history exists, and says so.
  const api = mine.filter((t) => t.platform !== 'facebook-personal');
  const apiPosts = api.reduce((n, t) => n + t.posts, 0);
  const apiPrevPosts = api.reduce((n, t) => n + t.prev_posts, 0);
  const profileShown = shown.includes('facebook-personal');
  const sumKnown = (key: 'views' | 'engagement') => {
    const known = mine.reduce((n, t) => n + t[`${key}_known`], 0);
    return { known, total: known === 0 ? null : mine.reduce((n, t) => n + (t[key] ?? 0), 0) };
  };
  const views = sumKnown('views');
  const engagement = sumKnown('engagement');

  // Every publish week in the window that any shown account posted in, so the
  // charts for different accounts share an x axis and line up.
  const weeks = [...new Set(weekly.map((w) => w.week))].sort();
  const cell = (p: SocialPlatform, week: string): WeekRow | undefined =>
    weekly.find((w) => w.platform === p && w.week === week);
  const maxOf = (key: 'views' | 'engagement') => Math.max(1, ...weekly.map((w) => w[key] ?? 0));

  const urgent = attention.filter((a) => a.level === 'bad').length;
  const VISIBLE = 3;

  const sessionPoints = website.daily.map((d) => ({
    label: shortDate(d.day),
    value: d.sessions,
    href: link('/dashboard/funnel', { back: 'overview' }),
  }));
  const clickPoints = weeklyClicks.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.clicks as number) ?? 0,
    href: link('/dashboard/funnel', { back: 'overview' }),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Overview"
        meta={[
          { label: 'Instagram and Page synced', value: fresh.meta ? shortDateTime(fresh.meta) : 'never' },
          { label: 'Profile collected', value: fresh.profile ? shortDateTime(fresh.profile) : 'never' },
          { label: 'Website synced', value: website.gaLastSynced ? shortDateTime(website.gaLastSynced) : 'never' },
        ]}
      />

      {/* Filters first: everything below answers to them. */}
      <FilterBar>
        <PeriodPicker period={period} bare />
        <PlatformFilter current={platform} />
      </FilterBar>

      {/* The five second answer. */}
      <div className={`grid grid-cols-2 ${single ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-3`}>
        {followers
          .filter((f) => shown.includes(f.platform))
          .map((f) => (
            <MetricCard
              key={f.platform}
              label={`${platformLabel(f.platform)} followers`}
              accent={platformColor(f.platform)}
              value={f.latest ? full(f.latest.followers) : 'Not read'}
              href={link(f.platform === 'facebook-personal' ? '/dashboard/profile' : '/dashboard/audience', {
                back: 'overview',
              })}
              info={`Followers gained in the window: ${f.gainedHow}.`}
            >
              {f.gained === null ? (
                <CardLine>Change in this window not known</CardLine>
              ) : (
                <span className="text-sm tabular-nums" style={{ color: C.text, fontWeight: 700 }}>
                  {f.gained > 0 ? '+' : ''}
                  {full(f.gained)}{' '}
                  <span className="text-xs" style={{ color: C.muted, fontWeight: 400 }}>
                    in this window
                  </span>
                </span>
              )}
              <CardLine>{f.latest ? `Read ${shortDate(f.latest.recorded_on)}` : 'No total stored yet'}</CardLine>
            </MetricCard>
          ))}

        <MetricCard label="Posts published" value={full(posts)} href={link('/dashboard/posts')}>
          <CardLine>{period.label}. Stories not counted</CardLine>
          {comparing && api.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {profileShown && <CardLine>Instagram and Page: {full(apiPosts)}</CardLine>}
              <Change current={apiPosts} previous={apiPrevPosts} against={period.compareLabel} />
            </div>
          )}
          {comparing && profileShown && <CardLine>Profile: earlier window not collected</CardLine>}
        </MetricCard>

        <MetricCard
          label="Views on those posts"
          value={views.total === null ? 'No figure' : full(views.total)}
          href={link('/dashboard/posts')}
          info={VIEWS_INFO}
        >
          <CardLine>Total to date, not views in the window</CardLine>
          {views.known < posts && (
            <CardLine>
              {views.known} of {posts} posts have a figure
            </CardLine>
          )}
        </MetricCard>

        <MetricCard
          label="Engagement on those posts"
          value={engagement.total === null ? 'No figure' : full(engagement.total)}
          href={link('/dashboard/posts')}
          info={ENGAGEMENT_INFO}
        >
          <CardLine>Total to date, not engagement in the window</CardLine>
          {engagement.known < posts && (
            <CardLine>
              {engagement.known} of {posts} posts have a figure
            </CardLine>
          )}
        </MetricCard>
      </div>

      <SectionHeading note="follower totals inside the window, one chart per account">Audience growth</SectionHeading>
      <div className={`grid grid-cols-1 ${single ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-3`}>
        {followers
          .filter((f) => shown.includes(f.platform))
          .map((f) => {
            const dest = link(f.platform === 'facebook-personal' ? '/dashboard/profile' : '/dashboard/audience', {
              back: 'overview',
            });
            return (
              <ChartCard
                key={f.platform}
                title={platformLabel(f.platform)}
                swatch={platformColor(f.platform)}
                href={dest}
                note={
                  f.points.length >= 2
                    ? `${f.points.length} readings, ${shortDate(f.points[0].recorded_on)} to ${shortDate(
                        f.points[f.points.length - 1].recorded_on
                      )}`
                    : 'Followers'
                }
                info="Follower totals as read on each day. The axis starts at the lowest total shown, so small movements are visible. The first and last totals are printed."
              >
                {f.points.length >= 2 ? (
                  <MiniTrend
                    points={f.points.map((p) => ({
                      label: shortDate(p.recorded_on),
                      value: p.followers,
                      href: dest,
                    }))}
                    color={platformColor(f.platform)}
                    ariaLabel={`${platformLabel(f.platform)} followers over ${f.points.length} readings`}
                  />
                ) : (
                  <ChartEmpty>
                    {f.latest
                      ? `One reading so far: ${full(f.latest.followers)} on ${shortDate(
                          f.latest.recorded_on
                        )}. A line needs two readings inside the window.`
                      : 'No follower total has been stored for this account.'}
                  </ChartEmpty>
                )}
              </ChartCard>
            );
          })}
      </div>

      {/*
        With every account shown, each measure gets a row of three charts. With
        one account chosen there is one chart per measure, so the two sit side
        by side instead of each stretching across the page.
      */}
      <div className={single ? 'grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-5' : 'space-y-5'}>
        <div className="space-y-5">
          <SectionHeading note={single ? 'click a bar for its posts' : 'posts grouped by the week they were published. Click a bar for its posts'}>
            Views to date by publish week
          </SectionHeading>
          <WeekCharts
            metric="views"
            shown={shown}
            weeks={weeks}
            cell={cell}
            max={maxOf('views')}
            link={link}
            info={VIEWS_INFO}
          />
        </div>
        <div className="space-y-5">
          <SectionHeading note="same posts, same weeks">Engagement to date by publish week</SectionHeading>
          <WeekCharts
            metric="engagement"
            shown={shown}
            weeks={weeks}
            cell={cell}
            max={maxOf('engagement')}
            link={link}
            info={ENGAGEMENT_INFO}
          />
        </div>
      </div>

      {platform === 'all' && (
        <>
          <SectionHeading note={`posts published in ${period.label.toLowerCase()}`}>Platform performance</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChartCard
              title="Views, total to date"
              info="Added across each account’s posts published in the window. An account that posted more will usually show more. Instagram’s API reports fewer views for images and carousels than the Instagram app does."
              note="Click an account for its posts"
            >
              <BarList
                valueLabel="Views"
                emptyMessage="No posts with a views figure in this window."
                data={totals
                  .filter((t) => t.posts > 0 && t.views !== null)
                  .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
                  .map((t) => ({
                    key: t.platform,
                    label: platformLabel(t.platform),
                    value: t.views ?? 0,
                    meta: postsMeta(t.posts, t.views_known),
                    color: platformColor(t.platform),
                    href: withFilters('/dashboard/posts', period, t.platform, { origin: 'all' }),
                  }))}
              />
            </ChartCard>
            <ChartCard
              title="Median views per post"
              info="The middle post, so one unusually large post does not lift the figure. The fairer comparison when accounts post different amounts. Still a total to date for posts of different ages."
              note="Click an account for its posts"
            >
              <BarList
                valueLabel="Median views"
                emptyMessage="No posts with a views figure in this window."
                data={totals
                  .filter((t) => t.posts > 0 && t.median_views !== null)
                  .sort((a, b) => (b.median_views ?? 0) - (a.median_views ?? 0))
                  .map((t) => ({
                    key: t.platform,
                    label: platformLabel(t.platform),
                    value: Math.round(t.median_views ?? 0),
                    meta: postsMeta(t.posts, t.views_known),
                    color: platformColor(t.platform),
                    href: withFilters('/dashboard/posts', period, t.platform, { origin: 'all' }),
                  }))}
              />
            </ChartCard>
          </div>
        </>
      )}

      <SectionHeading note="visits to the website. Not social views, and not filtered by account">
        Website traffic
      </SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Website sessions"
          value={full(website.sessions.current)}
          href={link('/dashboard/funnel', { back: 'overview' })}
          info="Sessions recorded by Google Analytics inside the window. Google revises the last two days, so the newest figures can still move."
        >
          <CardLine>
            {period.label}
            {website.gaLatestDate ? `. Data to ${shortDate(website.gaLatestDate)}` : ''}
          </CardLine>
          {comparing && (
            <Change current={website.sessions.current} previous={website.sessions.previous} against={period.compareLabel} />
          )}
        </MetricCard>
        <MetricCard
          label="Link clicks"
          value={full(website.clicks.current)}
          href={link('/dashboard/funnel', { back: 'overview' })}
          info="Clicks on your /go/ links by people, inside the window. Link preview crawlers and your own test clicks are excluded."
        >
          <CardLine>{period.label}</CardLine>
          {comparing && (
            <Change current={website.clicks.current} previous={website.clicks.previous} against={period.compareLabel} />
          )}
        </MetricCard>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard
          title="Sessions per day"
          href={link('/dashboard/funnel', { back: 'overview' })}
          note="Google Analytics, days inside the window. First, last and peak are labelled"
        >
          {sessionPoints.length >= 2 ? (
            <MiniTrend points={sessionPoints} ariaLabel="Website sessions per day" zeroBase />
          ) : (
            <ChartEmpty>Fewer than two days of sessions in this window.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard
          title="Link clicks per week"
          href={link('/dashboard/funnel', { back: 'overview' })}
          note="Clicks by people, weeks inside the window"
        >
          {clickPoints.length >= 2 ? (
            <MiniTrend points={clickPoints} ariaLabel="Link clicks per week" zeroBase />
          ) : (
            <ChartEmpty>Fewer than two weeks with clicks in this window.</ChartEmpty>
          )}
        </ChartCard>
      </div>

      <SectionHeading
        note={
          attention.length === 0
            ? 'nothing flagged'
            : `${attention.length} flagged${urgent > 0 ? `, ${urgent} urgent` : ''}. Worst first`
        }
      >
        Needs a look
      </SectionHeading>
      {attention.length === 0 ? (
        <p className="text-xs" style={{ color: C.muted }}>
          Every check passed, or there is not enough data yet to judge.
        </p>
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {attention.slice(0, VISIBLE).map((item, i) => (
              <AttentionRow key={`${item.title}-${i}`} item={item} href={itemHref(item, period, platform)} />
            ))}
          </ul>
          {attention.length > VISIBLE && (
            <div className="mt-3">
              <Disclosure summary={`${attention.length - VISIBLE} more`}>
                <ul className="flex flex-col gap-2">
                  {attention.slice(VISIBLE).map((item, i) => (
                    <AttentionRow key={`${item.title}-${i}`} item={item} href={itemHref(item, period, platform)} />
                  ))}
                </ul>
              </Disclosure>
            </div>
          )}
        </div>
      )}

      <Disclosure summary="How to read this page, and what it cannot see">
        <ul className="space-y-2">
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Views and engagement are totals to date.</span> Only
            each post&apos;s running total is stored, so there is no &quot;views this week&quot;. The charts group
            posts by the week they were published. A newer week is lower partly because its posts are younger.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Three accounts, three sources.</span> Instagram and
            the Facebook Page come from Meta&apos;s API. The Facebook Profile is read from Facebook&apos;s own
            screens when you press Collect, so it is only as fresh as the last collection, and whether its figures
            are lifetime totals is not confirmed.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>No reach.</span> Meta returns zero reach for every
            Page post, and unique viewers cannot be added across posts, so this page uses views.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>The small sample rules are provisional.</span> A
            change is given as a percentage only when the earlier window had at least {THRESHOLDS.minSampleUrgent}{' '}
            events, and a finding built on fewer than {THRESHOLDS.minSampleUrgent} events or{' '}
            {THRESHOLDS.minSamplePostsUrgent} posts is held below urgent. Those cut-offs were chosen by judgement to
            stop small counts from shouting. They are not validated benchmarks and say nothing about what good
            performance is.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Stories are not counted as posts.</span> A story is
            read once, at whatever age it has that day, so its views do not compare with a post&apos;s. Profile
            stories are on the Profile page.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>TikTok and YouTube</span> have no integration. Their
            links are tracked on the{' '}
            <Link href={link('/dashboard/funnel')} style={{ color: C.text, textDecoration: 'underline' }}>
              funnel
            </Link>
            , their posts are not.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

/** "5 posts", with how many carry a figure when not all do, and a flag when the sample is small. */
function postsMeta(posts: number, known: number): string {
  const base = known < posts ? `${known} of ${posts} posts` : `${posts} post${posts === 1 ? '' : 's'}`;
  return known < THRESHOLDS.minSamplePosts ? `${base}, small sample` : base;
}

/**
 * One row of column charts, one chart per account, all on the same weeks and
 * the same scale so heights compare across accounts. Each bar opens the posts
 * published in that week on that account.
 */
function WeekCharts({
  metric,
  shown,
  weeks,
  cell,
  max,
  link,
  info,
}: {
  metric: 'views' | 'engagement';
  shown: SocialPlatform[];
  weeks: string[];
  cell: (p: SocialPlatform, week: string) => WeekRow | undefined;
  max: number;
  link: (href: string, extra?: Record<string, string | undefined>) => string;
  info: string;
}) {
  const noun = metric === 'views' ? 'views' : 'engagement';
  // A bar narrows the detail to its own account. `origin` remembers the
  // filter the Overview had, so the way back returns to the same view.
  const origin = shown.length > 1 ? 'all' : undefined;
  return (
    <div className={`grid grid-cols-1 ${shown.length > 1 ? 'md:grid-cols-3' : ''} gap-3`}>
      {shown.map((p) => {
        const columns = weeks.map((week) => {
          const row = cell(p, week);
          const value = row ? row[metric] : null;
          const posts = row?.posts ?? 0;
          const known = row ? row[`${metric}_known`] : 0;
          const what =
            posts === 0
              ? 'no posts published'
              : value === null
                ? `${posts} post${posts === 1 ? '' : 's'}, no ${noun} figure`
                : `${full(value)} ${noun} to date across ${known} of ${posts} post${posts === 1 ? '' : 's'}`;
          return {
            key: week,
            label: shortDate(week),
            // A week with no posts has nothing to draw. Zero is a real figure, and this is not one.
            value: posts === 0 ? null : value,
            nullLabel: posts === 0 ? 'no posts' : 'no figure',
            href: posts > 0 ? link('/dashboard/posts', { platform: p, week, origin }) : undefined,
            title: `Week of ${shortDate(week)}: ${what}.${posts > 0 ? ' Click for the posts' : ''}`,
          };
        });
        const total = weeks.reduce((n, w) => n + (cell(p, w)?.posts ?? 0), 0);
        return (
          <ChartCard
            key={p}
            title={platformLabel(p)}
            swatch={platformColor(p)}
            href={total > 0 ? link('/dashboard/posts', { platform: p, week: undefined, origin }) : undefined}
            info={info}
            note={
              <span className="inline-flex items-center gap-1.5 flex-wrap">
                {total} post{total === 1 ? '' : 's'} published in the window
                {total > 0 && total < THRESHOLDS.minSamplePosts && <SampleChip>small sample</SampleChip>}
              </span>
            }
          >
            <ColumnChart
              columns={total > 0 ? columns : []}
              max={max}
              color={platformColor(p)}
              ariaLabel={`${platformLabel(p)} ${noun} by publish week`}
              emptyMessage={`No ${platformLabel(p)} posts published in this window.`}
            />
          </ChartCard>
        );
      })}
    </div>
  );
}

/** A finding's link keeps the filters when it stays inside the dashboard. */
function itemHref(item: AttentionItem, period: Period, platform: PlatformChoice): string {
  return item.href.startsWith('/dashboard') ? withFilters(item.href, period, platform, { back: 'overview' }) : item.href;
}

/**
 * One finding: what it is, the numbers behind it, what to do. The numbers come
 * first in the detail, and a finding built on small counts is held at "needs
 * attention" by lib/status.ts and says its numbers are small.
 */
function AttentionRow({ item, href }: { item: AttentionItem; href: string }) {
  return (
    <li
      className="px-4 py-3"
      style={{
        ...CARD,
        borderRadius: RADIUS.md,
        borderLeft: `5px solid ${LEVEL_STYLE[item.level].color}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-0.5">
        <Link href={href} style={{ fontWeight: 700, color: C.text, textDecoration: 'none', fontSize: '0.95rem' }}>
          {item.title}
        </Link>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {item.detail.includes('Small sample') && (
            <InfoTip
              about="why this is not marked urgent"
              text={`Built on a small sample, so it is held below urgent. The cut-offs (fewer than ${THRESHOLDS.minSampleUrgent} events, or fewer than ${THRESHOLDS.minSamplePostsUrgent} posts) are provisional sample-size rules chosen by judgement. They are not validated performance benchmarks.`}
            />
          )}
          <StatusBadge
            status={{ level: item.level, label: item.level === 'bad' ? 'Urgent' : 'Watch', reason: item.detail }}
            compact
          />
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: C.muted }}>
        <span style={{ color: C.text }}>{item.detail}</span>
        {'. '}
        {item.action}
      </p>
    </li>
  );
}
