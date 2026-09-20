import Link from 'next/link';
import { getOverview, getWeeklyViews, getWeeklyClicks, getPeriodDeltas } from '@/lib/queries';
import { parsePeriod, withPeriod, type PeriodParams } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { getAttentionItems } from '@/lib/attention';
import { StatTile, TrendChart, Panel, PageHeader, Note, SectionHeading } from '@/components/charts';
import { Delta } from '@/components/Delta';
import { StatusBadge, StatusLegend } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { trendStatus, type Level, type Status } from '@/lib/status';
import { C, CARD, RADIUS, compact, shortDate, shortDateTime } from '@/lib/theme';

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
      <PageHeader
        title="Overview"
        lead={
          overview.posts > 0
            ? `${overview.posts} posts from ${shortDate(overview.earliest)} to ${shortDate(
                overview.latestPost
              )}.${
                overview.lastSyncedAt ? ` Last synced ${shortDateTime(overview.lastSyncedAt)}.` : ''
              }`
            : 'No posts synced yet.'
        }
      />

      {/*
        The attention list is the point of this screen: what to work on, worst
        first.

        The container is a plain card. An earlier version took the severity
        colour of its worst item as its own background, which turned the top of
        the dashboard into one large red block and made a background the
        loudest thing on the page. Colour belongs on the item it describes, at
        the size of that item: here a left accent plus the badge.
      */}
      <section className="p-5" style={CARD}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base" style={{ fontWeight: 600, color: C.text }}>
            {attention.length === 0
              ? 'Nothing needs attention'
              : `${urgent > 0 ? `${urgent} urgent` : ''}${urgent > 0 && watch > 0 ? ', ' : ''}${
                  watch > 0 ? `${watch} to watch` : ''
                }`}
          </h2>
          <StatusLegend />
        </div>

        {attention.length === 0 ? (
          <p className="text-sm" style={{ color: C.muted }}>
            Every check passed, or there is not enough data yet to judge. Thresholds live in
            lib/status.ts.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attention.map((item, i) => (
              <li
                key={`${item.title}-${i}`}
                className="px-3 py-2.5"
                style={{
                  background: C.card,
                  borderRadius: RADIUS.sm,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${LEVEL_STYLE[item.level].color}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
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
                <p className="text-xs mb-1" style={{ color: C.muted }}>
                  {item.detail}
                </p>
                <p className="text-xs" style={{ color: C.text }}>
                  {item.action}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PeriodPicker period={period} />

      <SectionHeading note="activity that happened during the window">
        {period.label}
      </SectionHeading>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Posts published"
          value={compact(d.publishedPosts.current)}
          delta={delta(d.publishedPosts.current, d.publishedPosts.previous)}
          sub="published in the window"
        />
        <StatTile
          label="Link clicks"
          value={compact(d.clicks.current)}
          status={trend(d.clicks.current, d.clicks.previous, 'clicks')}
          delta={delta(d.clicks.current, d.clicks.previous)}
          sub="clicks that happened in the window"
        />
        <StatTile
          label="New followers"
          value={compact(d.followers.current)}
          status={trend(d.followers.current, d.followers.previous, 'new followers')}
          delta={delta(d.followers.current, d.followers.previous)}
          sub="Instagram, gained in the window"
        />
        <StatTile
          label="Sessions"
          value={compact(d.sessions.current)}
          status={trend(d.sessions.current, d.sessions.previous, 'sessions')}
          delta={delta(d.sessions.current, d.sessions.previous)}
          sub="site visits in the window"
        />
      </div>

      <SectionHeading note="cumulative totals, not activity during the window">
        Posts published in this window
      </SectionHeading>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatTile
          label="Posts published"
          value={compact(d.publishedPosts.current)}
          sub={`in ${period.label.toLowerCase()}`}
        />
        <StatTile
          label="Current lifetime views of those posts"
          value={compact(d.publishedViews.current)}
          sub="not views that happened in the window"
        />
        <StatTile
          label="Current lifetime engagement of those posts"
          value={compact(d.publishedEngagement.current)}
          sub="not engagement during the window"
        />
      </div>

      <Note>
        These three are cumulative totals as they stand today, not activity inside the window. A post
        published yesterday has had a day to accumulate; one published four weeks ago has had four
        weeks, so comparing these across periods measures age as much as performance. For the
        question {'"'}is my newer work performing better{'"'}, use{' '}
        <Link href={withPeriod('/dashboard/recent', period)} style={{ color: C.text, textDecoration: 'underline' }}>
          Recent Posts
        </Link>
        , which compares posts at the same age.
      </Note>

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
        description={`Posts published in ${period.label.toLowerCase()}, grouped by the week they went out, lifetime views as of today. Older weeks have had longer to accumulate, so this is not views that happened each week.`}
      >
        <TrendChart points={viewPoints} valueLabel="Views" />
      </Panel>

      <Panel
        title="Link clicks per week"
        description={`First party clicks on your /go/ links that happened in ${period.label.toLowerCase()}. A real period figure, unlike the chart above.`}
      >
        <TrendChart
          points={clickPoints}
          valueLabel="Clicks"
          emptyMessage="Needs at least two weeks of click data."
        />
        <Note>
          Views and clicks are plotted separately on purpose. They are different scales, and one
          chart with two axes would invent a relationship that is not in the data.
        </Note>
      </Panel>

      <SectionHeading>Caveats</SectionHeading>

      <Panel title="Known blind spots" description="Things this dashboard cannot see.">
        <ul className="text-sm space-y-2" style={{ color: C.muted }}>
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
      </Panel>
    </div>
  );
}
