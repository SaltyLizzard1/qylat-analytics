import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getWeeklyClicks } from '@/lib/queries';
import { getFormatBenchmarkAtAge } from '@/lib/cohort';
import {
  OVERVIEW_DEFAULT_DAYS,
  PERIOD_COOKIE,
  parsePeriod,
  periodPhrase,
  rememberedPeriod,
  type Period,
  type PeriodParams,
} from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PlatformFilter } from '@/components/PlatformFilter';
import { getAttentionItems, type AttentionItem } from '@/lib/attention';
import {
  SOCIAL_PLATFORMS,
  getDetailPosts,
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
  PlatformChip,
  SampleChip,
} from '@/components/overview';
import { AudienceStrip, FormatBars, Takeaway, TopPosts } from '@/components/insights';
import { InfoTip } from '@/components/InfoTip';
import { StatusBadge } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { THRESHOLDS, type Level } from '@/lib/status';
import { C, CARD, RADIUS, SERIES, formatLabel, full, platformColor, platformLabel, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * The Overview, arranged to answer three questions in order: what worked,
 * what changed, and which posts to look at.
 *
 * Top to bottom: the filters, one or two sentences of fact, the three
 * accounts' followers in a strip, then the performance charts: the most
 * viewed posts per account and the formats compared at the same age. Below
 * those, what changed against the window before, the weekly charts, the
 * website, and the list of things that need a look.
 *
 * What this page will not do, however useful it would look:
 *   - draw "views this week". Views are stored as each post's total to date,
 *     so the charts show the posts published in a week and their totals as
 *     of the last read, and say so.
 *   - show a change for views or engagement. Posts of different ages are not
 *     comparable, and the profile's figures have an unverified scope.
 *   - add website sessions to social views, or one account's followers to
 *     another's. Each account and the website keep their own figures.
 *   - rank posts or formats across accounts. Accounts read views differently,
 *     so every bar is scaled inside its own account.
 *   - benchmark the Facebook Profile. It has no reading at a fixed age, so it
 *     stays out of the format comparison and says so.
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
const TOP_INFO: Record<SocialPlatform, string> = {
  instagram:
    'The posts published in this window with the most views to date, from Meta’s API. An older post has had longer to collect views. Instagram’s API reports fewer views for images and carousels than the app does. Bars compare posts inside this account only.',
  facebook:
    'The Facebook Page posts published in this window with the most views to date, from Meta’s API. An older post has had longer to collect views. Bars compare posts inside this account only.',
  'facebook-personal':
    'The Facebook Profile posts published in this window with the most views, as read from Facebook’s Content Library at the last collection. Whether that figure is a lifetime total is not confirmed. Bars compare posts inside this account only.',
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams & { platform?: string }>;
}) {
  const sp = await searchParams;
  const platform = parsePlatform(sp.platform);

  // An address that names no period opens on the last one chosen, or on 30
  // days. It is sent to an address that names it, so every link from here
  // carries the period and Back returns to the same view. An address that
  // already names a period is never changed.
  if (sp.period === undefined && !(sp.from && sp.to)) {
    const saved = (await cookies()).get(PERIOD_COOKIE)?.value;
    redirect(withFilters('/dashboard', rememberedPeriod(saved, sp.compare, OVERVIEW_DEFAULT_DAYS), platform));
  }

  const period = parsePeriod(sp);
  const shown: SocialPlatform[] = platform === 'all' ? [...SOCIAL_PLATFORMS] : [platform];
  const single = shown.length === 1;
  const age = THRESHOLDS.formatAgeHours;

  const [weekly, totals, followers, website, weeklyClicks, attention, fresh, detail, formats] = await Promise.all([
    getWeeklySocial(period, platform),
    getPlatformTotals(period),
    getFollowerSeries(period),
    getWebsiteTraffic(period),
    getWeeklyClicks(period),
    getAttentionItems(period),
    getFreshness(),
    getDetailPosts(period, platform, null),
    getFormatBenchmarkAtAge(age, period),
  ]);

  const link = (href: string, extra: Record<string, string | undefined> = {}) =>
    withFilters(href, period, platform, extra);
  const comparing = period.compare === 'previous';
  const published = `posts published ${periodPhrase(period)}`;
  // A mark that narrows to one account remembers the filter the Overview had,
  // so the way back returns to the same view.
  const origin = shown.length > 1 ? 'all' : undefined;

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

  const apiShown = shown.filter((p) => p !== 'facebook-personal');
  const accountNames = apiShown.map((p) => (p === 'facebook' ? 'the Facebook Page' : platformLabel(p)));

  /*
   * The summary. Facts only, each one already on the page below: how many
   * posts against the window before, and which format has the highest median
   * at a fixed age where at least two formats have enough posts to compare.
   * It never calls anything good or poor, and a small sample is left out of
   * the comparison, not described as weak.
   */
  const sentences: string[] = [];
  if (apiShown.length > 0 && comparing) {
    const names = accountNames.join(' and ');
    sentences.push(
      `${names.charAt(0).toUpperCase()}${names.slice(1)} published ${full(apiPosts)} post${apiPosts === 1 ? '' : 's'} ${periodPhrase(
        period
      )}, against ${full(apiPrevPosts)} in ${period.compareLabel}.`
    );
  } else {
    sentences.push(`${full(posts)} post${posts === 1 ? '' : 's'} published ${periodPhrase(period)}.`);
  }
  let formatFact = false;
  for (const p of apiShown) {
    const enough = formats.filter((f) => f.platform === p && f.posts >= THRESHOLDS.minSamplePosts);
    if (enough.length >= 2) {
      const best = [...enough].sort((a, b) => b.medianViews - a.medianViews)[0];
      sentences.push(
        `On ${platformLabel(p)}, the format with the highest median views at ${age} hours is ${formatLabel(best.format)}: ${full(
          Math.round(best.medianViews)
        )} across ${best.posts} posts.${
          p === 'instagram' ? ' Instagram’s API under-counts images and carousels, so this favours reels.' : ''
        }`
      );
      formatFact = true;
      break;
    }
  }
  if (!formatFact && apiShown.length > 0) {
    sentences.push(
      `No account has two formats with at least ${THRESHOLDS.minSamplePosts} posts measured at ${age} hours, so no format is named ahead.`
    );
  }

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

      <Takeaway
        sentences={sentences}
        how={`Two facts taken from the figures below, never a recommendation. The first is the post count against the window before, for the accounts whose earlier window exists. The second names the format with the highest median views ${age} hours after publishing, and only when at least two formats on one account have ${THRESHOLDS.minSamplePosts} or more posts to compare. Those cut-offs are provisional sample-size rules, not benchmarks.`}
      />

      <AudienceStrip
        accounts={followers.filter((f) => shown.includes(f.platform))}
        hrefFor={(p) => link(p === 'facebook-personal' ? '/dashboard/profile' : '/dashboard/audience', { back: 'overview' })}
      />

      <SectionHeading note={`Views to date · ${published} · each account on its own scale`}>
        What worked: top posts
      </SectionHeading>
      <div className={`grid grid-cols-1 ${single ? '' : 'lg:grid-cols-3'} gap-3`}>
        {shown.map((p) => (
          <TopPosts
            key={p}
            platform={p}
            posts={detail.filter((d) => d.platform === p)}
            hrefFor={(post) => `${link('/dashboard/posts', { platform: p, origin })}#post-${post.platform}-${post.id}`}
            allHref={link('/dashboard/posts', { platform: p, origin })}
            info={TOP_INFO[p]}
          />
        ))}
      </div>

      <SectionHeading note={`Median views ${age} hours after publishing · ${published} · each account on its own scale`}>
        What worked: formats at the same age
      </SectionHeading>
      <div className={`grid grid-cols-1 ${single ? '' : 'lg:grid-cols-3'} gap-3`}>
        {apiShown.map((p) => (
          <FormatBars
            key={p}
            platform={p}
            age={age}
            rows={formats.filter((f) => f.platform === p)}
            hrefFor={(format) => `${link('/dashboard/formats', { back: 'overview' })}#format-${p}-${format}`}
            caveat={p === 'instagram' ? 'The API under-counts images and carousels against the app, so this favours reels.' : undefined}
            info={`Each format’s middle post, measured ${age} hours after it was published, so a new post is not compared with an old one. Only posts at least ${age} hours old with a reading that young count. A format with fewer than ${THRESHOLDS.minSamplePosts} such posts is marked small sample and is not judged. Instagram’s API reports fewer views for images and carousels than the app does.`}
          />
        ))}
        {profileShown && (
          <section className="p-4" style={CARD}>
            <PlatformChip platform="facebook-personal" />
            <p className="text-sm mt-2" style={{ color: C.text, fontWeight: 600 }}>
              Not in this comparison
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: C.muted }}>
              The Profile is read when you press Collect, so it has no reading at a fixed age. Its posts are in the
              top posts above and on the{' '}
              <Link href={link('/dashboard/profile', { back: 'overview' })} style={{ color: C.text, textDecoration: 'underline' }}>
                Profile page
              </Link>
              .
            </p>
          </section>
        )}
      </div>

      <SectionHeading note={`${period.label}${comparing ? ` against ${period.compareLabel}` : ', comparison off'}`}>
        What changed
      </SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label="Posts published" value={full(posts)} href={link('/dashboard/posts')}>
          <CardLine>{period.label}. Stories not counted</CardLine>
          {comparing && api.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {profileShown && <CardLine>Instagram and Page: {full(apiPosts)}</CardLine>}
              <Change
                current={apiPosts}
                previous={apiPrevPosts}
                against={period.compareLabel}
                color={api.length === 1 ? platformColor(api[0].platform) : SERIES.general}
              />
            </div>
          )}
          {comparing && profileShown && <CardLine>Profile: earlier window not collected</CardLine>}
        </MetricCard>
        <MetricCard
          label="Website sessions"
          accent={SERIES.sessions}
          value={full(website.sessions.current)}
          href={link('/dashboard/funnel', { back: 'overview' })}
          info="Sessions recorded by Google Analytics inside the window. Not filtered by account. Google revises the last two days, so the newest figures can still move."
        >
          <CardLine>
            {period.label}
            {website.gaLatestDate ? `. Data to ${shortDate(website.gaLatestDate)}` : ''}
          </CardLine>
          {comparing && (
            <Change
              current={website.sessions.current}
              previous={website.sessions.previous}
              against={period.compareLabel}
              color={SERIES.sessions}
            />
          )}
        </MetricCard>
        <MetricCard
          label="Link clicks"
          accent={SERIES.clicks}
          value={full(website.clicks.current)}
          href={link('/dashboard/funnel', { back: 'overview' })}
          info="Clicks on your /go/ links by people, inside the window. Not filtered by account. Link preview crawlers and your own test clicks are excluded."
        >
          <CardLine>{period.label}</CardLine>
          {comparing && (
            <Change
              current={website.clicks.current}
              previous={website.clicks.previous}
              against={period.compareLabel}
              color={SERIES.clicks}
            />
          )}
        </MetricCard>
      </div>

      <SectionHeading note={`Totals to date · ${published} · grouped by publish week · click a bar for its posts`}>
        Views and engagement by publish week
      </SectionHeading>
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Views to date"
          value={views.total === null ? 'No figure' : full(views.total)}
          href={link('/dashboard/posts')}
          info={VIEWS_INFO}
        >
          <CardLine>
            {views.known < posts ? `${views.known} of ${posts} posts have a figure` : `${posts} post${posts === 1 ? '' : 's'}`}
          </CardLine>
        </MetricCard>
        <MetricCard
          label="Engagement to date"
          value={engagement.total === null ? 'No figure' : full(engagement.total)}
          href={link('/dashboard/posts')}
          info={ENGAGEMENT_INFO}
        >
          <CardLine>
            {engagement.known < posts
              ? `${engagement.known} of ${posts} posts have a figure`
              : `${posts} post${posts === 1 ? '' : 's'}`}
          </CardLine>
        </MetricCard>
      </div>
      {/*
        With every account shown, each measure gets a row of three charts. With
        one account chosen there is one chart per measure, so the two sit side
        by side instead of each stretching across the page.
      */}
      <div className={single ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
        <WeekCharts metric="views" shown={shown} weeks={weeks} cell={cell} max={maxOf('views')} link={link} info={VIEWS_INFO} />
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

      {platform === 'all' && (
        <>
          <SectionHeading note={`Views to date · ${published} · click an account for its posts`}>
            Accounts side by side
          </SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ChartCard
              title="Views to date, added up"
              info="Added across each account’s posts published in the window. An account that posted more will usually show more, and the three accounts do not read views the same way. Instagram’s API reports fewer views for images and carousels than the Instagram app does."
            >
              <BarList
                valueLabel="Views to date"
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
              title="Median views to date per post"
              info="The middle post, so one unusually large post does not lift the figure. The fairer comparison when accounts post different amounts. Still a total to date for posts of different ages, and the three accounts do not read views the same way."
            >
              <BarList
                valueLabel="Median views to date"
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

      <SectionHeading note="Visits inside the window · not social views · not filtered by account">
        Website traffic
      </SectionHeading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard
          title="Sessions per day"
          swatch={SERIES.sessions}
          href={link('/dashboard/funnel', { back: 'overview' })}
          note="Google Analytics. First, last and peak are labelled"
        >
          {sessionPoints.length >= 2 ? (
            <MiniTrend points={sessionPoints} color={SERIES.sessions} ariaLabel="Website sessions per day" zeroBase />
          ) : (
            <ChartEmpty>Fewer than two days of sessions in this window.</ChartEmpty>
          )}
        </ChartCard>
        <ChartCard
          title="Link clicks per week"
          swatch={SERIES.clicks}
          href={link('/dashboard/funnel', { back: 'overview' })}
          note="Clicks by people"
        >
          {clickPoints.length >= 2 ? (
            <MiniTrend points={clickPoints} color={SERIES.clicks} ariaLabel="Link clicks per week" zeroBase />
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
            are lifetime totals is not confirmed. That is why top posts and formats are scaled inside each account.
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
            title={`${platformLabel(p)}: ${noun} to date`}
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
        <Link href={href} style={{ fontWeight: 600, color: C.text, textDecoration: 'none', fontSize: '0.95rem' }}>
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
