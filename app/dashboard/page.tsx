import Link from 'next/link';
import { getOverview, getWeeklyViews, getWeeklyClicks } from '@/lib/queries';
import { getAttentionItems } from '@/lib/attention';
import { StatTile, TrendChart, Panel, PageHeader, Note } from '@/components/charts';
import { StatusBadge, StatusLegend } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import type { Level } from '@/lib/status';
import { C, RADIUS, compact, shortDate } from '@/lib/theme';

export const dynamic = 'force-dynamic';

const LEVEL_STYLE: Record<Level, { color: string; background: string; border: string }> = {
  good: severityGood,
  warning: severityWarning,
  bad: severityBad,
};

export default async function DashboardPage() {
  const [overview, weeklyViews, weeklyClicks, attention] = await Promise.all([
    getOverview(),
    getWeeklyViews(),
    getWeeklyClicks(),
    getAttentionItems(),
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        lead={
          overview.posts > 0
            ? `${overview.posts} posts from ${shortDate(overview.earliest)} to ${shortDate(
                overview.latestPost
              )}.${
                overview.lastSyncedAt
                  ? ` Last synced ${new Date(overview.lastSyncedAt).toLocaleString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}.`
                  : ''
              }`
            : 'No posts synced yet.'
        }
      />

      <StatusLegend />

      {/* The attention list is the point of this screen: what to work on, worst first. */}
      <section className="p-5" style={{ ...LEVEL_STYLE[attention[0]?.level ?? 'good'], borderRadius: RADIUS.md }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-base" style={{ fontWeight: 600 }}>
            {attention.length === 0
              ? 'Nothing needs attention'
              : `${urgent > 0 ? `${urgent} urgent` : ''}${urgent > 0 && watch > 0 ? ', ' : ''}${
                  watch > 0 ? `${watch} to watch` : ''
                }`}
          </h2>
        </div>

        {attention.length === 0 ? (
          <p className="text-sm">
            Every check passed, or there is not enough data yet to judge. Thresholds live in
            lib/status.ts.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {attention.map((item, i) => (
              <li
                key={`${item.title}-${i}`}
                className="p-3"
                style={{ background: C.card, borderRadius: RADIUS.sm, border: `1px solid ${C.border}` }}
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <Link
                    href={item.href}
                    className="text-sm"
                    style={{ fontWeight: 600, color: C.text, textDecoration: 'underline' }}
                  >
                    {item.title}
                  </Link>
                  <StatusBadge
                    status={{ level: item.level, label: item.level === 'bad' ? 'Urgent' : 'Watch', reason: item.detail }}
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

      <Panel
        title="Views per week"
        description="Total views of everything published that week, from the latest snapshot of each post."
      >
        <TrendChart points={viewPoints} valueLabel="Views" />
      </Panel>

      <Panel
        title="Link clicks per week"
        description="First party clicks on your /go/ links. This is the number that says whether social is sending anyone to the site."
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
