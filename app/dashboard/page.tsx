import Link from 'next/link';
import { getOverview, getWeeklyViews, getWeeklyClicks, getPeriodDeltas } from '@/lib/queries';
import { parsePeriod, withPeriod, type Period, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { getAttentionItems, type AttentionItem } from '@/lib/attention';
import {
  StatTile,
  TrendChart,
  Panel,
  PageHeader,
  SectionHeading,
  Disclosure,
  Verdict,
} from '@/components/charts';
import { Delta } from '@/components/Delta';
import { StatusBadge } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { trendStatus, type Level, type Status } from '@/lib/status';
import { C, RADIUS, compact, full, shortDate, shortDateTime } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LEVEL_STYLE: Record<Level, { color: string; background: string; border: string }> = {
  good: severityGood,
  warning: severityWarning,
  bad: severityBad,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<PeriodParams>;
}) {
  const period = parsePeriod(await searchParams);
  const [overview, weeklyViews, weeklyClicks, attention, d] = await Promise.all([
    getOverview(),
    getWeeklyViews(period),
    getWeeklyClicks(period),
    getAttentionItems(period),
    getPeriodDeltas(period),
  ]);

  const viewPoints = weeklyViews.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.views as number) ?? 0,
  }));
  const clickPoints = weeklyClicks.map((r) => ({
    label: shortDate(r.week as string),
    value: (r.clicks as number) ?? 0,
  }));

  const urgent = attention.filter((a) => a.level === 'bad').length;
  const watch = attention.filter((a) => a.level === 'warning').length;

  /**
   * Show the worst few, fold the rest.
   *
   * attention is already sorted worst first. Seven findings at two lines each
   * is the largest block of prose left on this page, and reading all of it is
   * the opposite of a glance. The count in the verdict above is the full
   * count, so nothing is understated, and the remainder is one click away
   * rather than gone.
   */
  const VISIBLE = 4;
  const shown = attention.slice(0, VISIBLE);
  const rest = attention.slice(VISIBLE);
  const restUrgent = rest.filter((a) => a.level === 'bad').length;

  const comparing = period.compare === 'previous';

  /**
   * A tile carries a status badge only when the movement crosses a threshold
   * in lib/status.ts. A "Good" badge on every tile would be noise, and the
   * Delta arrow already says which way it went. Posts published gets no
   * badge: posting less is a choice, not a fault.
   */
  const trend = (current: number, previous: number, what: string): Status | undefined => {
    if (!comparing) return undefined;
    const st = trendStatus(current, previous, what, period.compareLabel);
    return st && st.level !== 'good' ? st : undefined;
  };

  const delta = (current: number, previous: number) =>
    comparing ? <Delta current={current} previous={previous} suffix={`vs ${period.compareLabel}`} /> : undefined;

  return (
    <div className="space-y-5">
      {/*
        Three figures, not a sentence. This used to read "18 posts from 12 Jun
        to 25 Sept. Last synced 27 Sept, 18:41." which is a paragraph you have
        to parse left to right before you learn anything.
      */}
      <PageHeader
        title="Overview"
        meta={
          overview.posts > 0
            ? [
                { label: 'Posts', value: String(overview.posts) },
                {
                  label: 'Range',
                  value: `${shortDate(overview.earliest)} to ${shortDate(overview.latestPost)}`,
                },
                ...(overview.lastSyncedAt
                  ? [{ label: 'Synced', value: shortDateTime(overview.lastSyncedAt) }]
                  : []),
              ]
            : undefined
        }
        lead={overview.posts > 0 ? undefined : 'No posts synced yet.'}
      />

      {/*
        The point of this screen: what to work on, worst first, with the count
        as the largest thing on the page so it answers "where do I stand"
        before anything is read.

        The container is a plain card. An earlier version took the severity
        colour of its worst item as its own background, which turned the top of
        the dashboard into one large red block and made a background the
        loudest thing on the page. Colour belongs on the item it describes, at
        the size of that item: here a left accent plus the badge.
      */}
      <Verdict urgent={urgent} watch={watch}>
        {attention.length === 0 ? (
          <p className="text-xs" style={{ color: C.muted }}>
            Every check passed, or there is not enough data yet to judge.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {shown.map((item, i) => (
                <AttentionRow key={`${item.title}-${i}`} item={item} period={period} />
              ))}
            </ul>

            {rest.length > 0 && (
              <div className="mt-3">
                <Disclosure
                  summary={`${rest.length} more${restUrgent > 0 ? `, including ${restUrgent} urgent` : ''}`}
                >
                  <ul className="flex flex-col gap-2">
                    {rest.map((item, i) => (
                      <AttentionRow key={`${item.title}-${i}`} item={item} period={period} />
                    ))}
                  </ul>
                </Disclosure>
              </div>
            )}
          </>
        )}
      </Verdict>

      <PeriodPicker period={period} />

      {/*
        The four that answer "how did this window go". Hero size, full digits
        rather than compact, because 1,284 reads as a measurement where 1.3k
        reads as an estimate. The heading says the window, so no tile repeats
        "in the window" in its own subtitle.
      */}
      <SectionHeading note="activity inside the window">{period.label}</SectionHeading>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          size="hero"
          label="Posts published"
          value={full(d.publishedPosts.current)}
          delta={delta(d.publishedPosts.current, d.publishedPosts.previous)}
        />
        <StatTile
          size="hero"
          label="Link clicks"
          value={full(d.clicks.current)}
          status={trend(d.clicks.current, d.clicks.previous, 'clicks')}
          delta={delta(d.clicks.current, d.clicks.previous)}
        />
        <StatTile
          size="hero"
          label="New followers"
          value={full(d.followers.current)}
          status={trend(d.followers.current, d.followers.previous, 'new followers')}
          delta={delta(d.followers.current, d.followers.previous)}
          sub="Instagram only"
        />
        <StatTile
          size="hero"
          label="Sessions"
          value={full(d.sessions.current)}
          status={trend(d.sessions.current, d.sessions.previous, 'sessions')}
          delta={delta(d.sessions.current, d.sessions.previous)}
          sub="Google Analytics"
        />
      </div>

      {/*
        The heading now agrees with the note. It used to say "Posts published in
        this window" over a note reading "cumulative totals, not activity during
        the window", and repeated the Posts published tile from the grid above
        with the identical value.
      */}
      <SectionHeading note="as they stand today, not window activity">
        Lifetime totals for those posts
      </SectionHeading>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Lifetime views" value={compact(d.publishedViews.current)} />
        <StatTile label="Lifetime engagement" value={compact(d.publishedEngagement.current)} />
      </div>

      <Disclosure summary="Why these two measure age as much as performance">
        They are cumulative totals as they stand today, not activity inside the window. A post
        published yesterday has had a day to accumulate; one published four weeks ago has had four
        weeks, so comparing these across periods measures age as much as performance. For the
        question {'"'}is my newer work performing better{'"'}, use{' '}
        <Link
          href={withPeriod('/dashboard/recent', period)}
          style={{ color: C.text, textDecoration: 'underline' }}
        >
          Recent Posts
        </Link>
        , which compares posts at the same age.
      </Disclosure>

      <SectionHeading note="every post ever synced">All time</SectionHeading>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Posts" value={compact(overview.posts)} sub="Facebook and Instagram" />
        <StatTile label="Views" value={compact(overview.views)} sub="latest snapshot per post" />
        <StatTile
          label="Engagement"
          value={compact(overview.engagement)}
          sub="likes, comments, saves, shares"
        />
        <StatTile
          label="Link clicks"
          value={compact(overview.clicks)}
          sub={`across ${overview.links} /go/ links`}
        />
      </div>

      <SectionHeading>Trends</SectionHeading>

      <Panel
        title="Lifetime views by publish week"
        description="Grouped by the week each post went out. Lifetime views as of today, not views that happened that week."
        detail={{
          summary: 'Why older weeks look better than they are',
          children:
            'Posts published inside the selected window, grouped by the week they went out, showing lifetime views as of today. Older weeks have had longer to accumulate, so a higher point on the left is age rather than a drop in performance since.',
        }}
      >
        <TrendChart points={viewPoints} valueLabel="Views" />
      </Panel>

      <Panel
        title="Link clicks per week"
        description="Clicks that happened inside the selected window. A real period figure, unlike the chart above."
        detail={{
          summary: 'Why views and clicks are two charts and not one',
          children:
            'They are different scales. One chart with two y axes would invent a relationship that is not in the data, which is the most common way a chart lies. Counted from human_clicks, so Meta fetching your link to build a preview is excluded.',
        }}
      >
        <TrendChart
          points={clickPoints}
          valueLabel="Clicks"
          emptyMessage="Needs at least two weeks of click data."
        />
      </Panel>

      {/*
        Was a full Panel with three bulleted paragraphs at the foot of the page.
        The content is unchanged and still one click away, but it no longer
        costs a hundred words of reading on every visit.
      */}
      <Disclosure summary="Three things this dashboard cannot see">
        <ul className="space-y-2">
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Your personal Facebook profile.</span>{' '}
            Meta publishes no API for personal profiles, and that is where your audience actually
            is. Track it by hand on the{' '}
            <Link href="/admin/audience" style={{ color: C.text, textDecoration: 'underline' }}>
              audience screen
            </Link>
            .
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Facebook Page reach.</span> Meta accepts
            the metric and returns zero for every Page post, so every comparison here uses views.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>TikTok and YouTube.</span> No
            integration. Links tagged to them are tracked, the posts are not.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

/**
 * One finding: what it is, the number behind it, what to do.
 *
 * Evidence and action share a line rather than taking a paragraph each. The
 * measurement is what you are being told and the action is a quiet suffix, so
 * a row is two lines instead of four and a list of them can be scanned.
 */
function AttentionRow({ item, period }: { item: AttentionItem; period: Period }) {
  return (
    <li
      className="px-3 py-2.5"
      style={{
        background: C.card,
        borderRadius: RADIUS.sm,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${LEVEL_STYLE[item.level].color}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-0.5">
        {/* A dashboard link keeps the selected window, custom ranges included. */}
        <Link
          href={item.href.startsWith('/dashboard') ? withPeriod(item.href, period) : item.href}
          className="text-sm"
          style={{ fontWeight: 600, color: C.text, textDecoration: 'none' }}
        >
          {item.title}
        </Link>
        <StatusBadge
          status={{
            level: item.level,
            label: item.level === 'bad' ? 'Urgent' : 'Watch',
            reason: item.detail,
          }}
          compact
        />
      </div>
      <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
        <span style={{ color: C.text }}>{item.detail}</span>
        {'. '}
        {item.action}
      </p>
    </li>
  );
}
