import Link from 'next/link';
import { getAgeNormalisedComparison, getRecentPosts, getAgeCoverage } from '@/lib/cohort';
import { parsePeriod, parseAge, AGE_CHOICES, withPeriod } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PageHeader, Panel, Empty, Note, StatTile } from '@/components/charts';
import { StatusBadge } from '@/components/status';
import { PostThumb } from '@/components/PostThumb';
import { PERFORMANCE_SHORT, PERFORMANCE_LABEL, type Level } from '@/lib/status';
import { pillarLabel } from '@/lib/pillars';
import { C, RADIUS, compact, pct, platformLabel, formatLabel, platformColor } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/** A judgement needs at least this many comparable posts behind it. */
const MIN_PEERS = 4;

/** A reading only exists once the post has actually reached that age. */
function AtAge({ value, reached, label }: { value: number | null; reached: boolean; label: string }) {
  const pending = !reached;
  return (
    <span
      className="text-sm tabular-nums"
      style={{ textAlign: 'right', color: pending || value === null ? C.muted : C.text }}
      title={pending ? `Not yet ${label} old` : value === null ? `No snapshot within ${label} of publishing` : undefined}
    >
      {pending ? '·' : value === null ? '--' : compact(value)}
    </span>
  );
}

function ageLabel(hours: number): string {
  if (hours < 48) return `${Math.max(Math.round(hours), 0)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function changePct(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || !previous) return null;
  const c = ((current - previous) / previous) * 100;
  return `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`;
}

export default async function RecentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string; age?: string }>;
}) {
  const sp = await searchParams;
  const period = parsePeriod(sp);
  const age = parseAge(sp.age);

  const [cmp, posts, coverage] = await Promise.all([
    getAgeNormalisedComparison({ ageHours: age.hours, currentDays: period.days }),
    getRecentPosts(Math.max(period.days, 14)),
    getAgeCoverage(),
  ]);

  const enough = cmp.current.posts >= 1 && cmp.previous.posts >= 1;
  const thin = cmp.current.posts < MIN_PEERS || cmp.previous.posts < MIN_PEERS;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recent Posts"
        lead="Posts compared at the same age after publishing, never on lifetime totals. A post from this week has had days to accumulate views; one from June has had months, so comparing their running totals measures age, not performance."
      />

      <PeriodPicker period={period} />

      {/* Age is its own control: it selects WHEN in a post's life to measure. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5"
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}
      >
        <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
          Measured at
        </span>
        <div className="flex gap-1">
          {AGE_CHOICES.map((a) => {
            const active = a.hours === age.hours;
            const q = new URLSearchParams({ period: String(period.days), age: String(a.hours) });
            if (period.compare !== 'previous') q.set('compare', period.compare);
            return (
              <Link
                key={a.hours}
                href={`/dashboard/recent?${q.toString()}`}
                className="text-xs px-2.5 py-1"
                style={{
                  borderRadius: RADIUS.sm,
                  textDecoration: 'none',
                  border: `1px solid ${active ? C.text : C.border}`,
                  background: active ? C.text : C.card,
                  color: active ? C.page : C.muted,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {a.label}
              </Link>
            );
          })}
        </div>
        <span className="text-xs" style={{ color: C.muted }}>
          Each post measured by its latest snapshot taken within {age.short} of publishing
        </span>
      </div>

      <Panel
        title={`Posts published in the ${period.label.toLowerCase()}, at ${age.short}`}
        description={
          period.compare === 'previous'
            ? `Against posts published in ${period.compareLabel}, measured at the same ${age.short} point in their own lives. Like for like.`
            : 'Comparison hidden. Turn it back on in the period control above.'
        }
      >
        {!enough ? (
          <Empty message="Not enough comparable posts yet." />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label={`Posts with a ${age.short} snapshot`}
              value={`${cmp.current.posts}`}
              sub={
                period.compare === 'previous'
                  ? `against ${cmp.previous.posts} previously`
                  : undefined
              }
            />
            <StatTile
              label={`Median views at ${age.short}`}
              value={cmp.current.medianViews === null ? '--' : compact(Math.round(cmp.current.medianViews))}
              sub={
                period.compare === 'previous' && cmp.previous.medianViews !== null
                  ? `${compact(Math.round(cmp.previous.medianViews))} previously${
                      changePct(cmp.current.medianViews, cmp.previous.medianViews)
                        ? `, ${changePct(cmp.current.medianViews, cmp.previous.medianViews)}`
                        : ''
                    }`
                  : undefined
              }
            />
            <StatTile
              label={`Median engagement rate at ${age.short}`}
              value={
                cmp.current.medianEngagementRate === null
                  ? '--'
                  : `${(cmp.current.medianEngagementRate * 100).toFixed(1)}%`
              }
              sub={
                period.compare === 'previous' && cmp.previous.medianEngagementRate !== null
                  ? `${(cmp.previous.medianEngagementRate * 100).toFixed(1)}% previously`
                  : undefined
              }
            />
            <StatTile
              label={`Saves per 1,000 views`}
              value={cmp.current.savesPer1k === null ? '--' : cmp.current.savesPer1k.toFixed(1)}
              sub={
                period.compare === 'previous' && cmp.previous.savesPer1k !== null
                  ? `${cmp.previous.savesPer1k.toFixed(1)} previously`
                  : undefined
              }
            />
          </div>
        )}

        {(cmp.currentMissing > 0 || cmp.previousMissing > 0) && (
          <Note>
            {cmp.currentMissing > 0 && (
              <>
                {cmp.currentMissing} post{cmp.currentMissing === 1 ? '' : 's'} in this period
                {cmp.previousMissing > 0 ? ` and ${cmp.previousMissing} in the previous one` : ''}
              </>
            )}
            {cmp.currentMissing === 0 && cmp.previousMissing > 0 && (
              <>{cmp.previousMissing} posts in the previous period</>
            )}{' '}
            have no snapshot taken within {age.short} of publishing, so they are excluded rather than
            compared on a later reading. Snapshots only began on{' '}
            {coverage.firstSnapshot
              ? new Date(coverage.firstSnapshot).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
              : 'the first sync'}
            , and Meta returns a post{"'"}s current totals rather than its history, so earlier posts can
            never gain one.
          </Note>
        )}

        {thin && enough && (
          <Note>
            Both cohorts are small, so read this as a direction rather than a measurement. A single
            unusual post moves a median of three or four.
          </Note>
        )}
      </Panel>

      <Panel
        title="Every recent post"
        description={`Published in the last ${Math.max(period.days, 14)} days. The verdict compares each post against the median of same platform and same format posts measured at ${age.short}, and refuses to judge below ${MIN_PEERS} comparable posts.`}
      >
        {posts.length === 0 ? (
          <Empty message="No posts published in this window." />
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 900 }}>
              <div
                className="grid gap-3 px-3 pb-2 text-xs uppercase"
                style={{
                  gridTemplateColumns: '2.6fr 5.2rem 4.6rem 4.6rem 4.6rem 4.6rem 4.4rem 6.4rem',
                  color: C.muted,
                  letterSpacing: '0.08em',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span>Post</span>
                <span style={{ textAlign: 'right' }}>Age</span>
                <span style={{ textAlign: 'right' }}>Views now</span>
                <span style={{ textAlign: 'right' }}>At 24h</span>
                <span style={{ textAlign: 'right' }}>At 72h</span>
                <span style={{ textAlign: 'right' }}>Eng. rate</span>
                <span style={{ textAlign: 'right' }}>Saves</span>
                <span>Versus peers</span>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                {posts.map((p) => {
                  const peers = p.peer_count_24h ?? 0;

                  /*
                   * A post that has not lived N hours has no N-hour figure.
                   * The query correctly takes the latest snapshot at or before
                   * the target, but for an 18 hour old post that snapshot is
                   * an 18 hour reading, and showing it under "At 72h" claims a
                   * measurement that does not exist yet.
                   */
                  const reached24 = Number(p.age_hours) >= 24;
                  const reached72 = Number(p.age_hours) >= 72;
                  // The post itself is inside the peer set, so require one more
                  // than the minimum before the comparison means anything.
                  const usable =
                    reached24 && p.views_24h !== null && p.peer_median_24h !== null && peers > MIN_PEERS;
                  let verdict: { level: Level; label: string; why: string } | null = null;
                  if (usable) {
                    const ratio = (p.views_24h as number) / (p.peer_median_24h as number);
                    const level: Level = ratio >= 1.3 ? 'good' : ratio >= 0.7 ? 'warning' : 'bad';
                    verdict = {
                      level,
                      label: PERFORMANCE_SHORT[level],
                      why: `${Math.round(ratio * 100)}% of the ${Math.round(
                        p.peer_median_24h as number
                      )} median 24h views across ${peers} ${platformLabel(p.platform)} ${formatLabel(
                        p.format
                      ).toLowerCase()}s`,
                    };
                  }
                  const caption = (p.caption ?? 'Untitled post').replace(/\s+/g, ' ').trim();

                  return (
                    <div
                      key={p.id}
                      className="grid gap-3 items-center px-3 py-2.5"
                      style={{
                        gridTemplateColumns: '2.6fr 5.2rem 4.6rem 4.6rem 4.6rem 4.6rem 4.4rem 6.4rem',
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: RADIUS.md,
                      }}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <PostThumb src={p.thumbnail_url} label={formatLabel(p.format)} size={36} />
                        <span className="min-w-0">
                          <span className="block text-sm truncate" style={{ color: C.text }}>
                            {p.permalink ? (
                              <a
                                href={p.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: C.text, textDecoration: 'none' }}
                              >
                                {caption}
                              </a>
                            ) : (
                              caption
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 mt-1">
                            <span
                              className="text-xs px-1.5 py-0.5"
                              style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
                            >
                              <span
                                aria-hidden
                                style={{
                                  display: 'inline-block',
                                  width: 6,
                                  height: 6,
                                  borderRadius: 999,
                                  background: platformColor(p.platform),
                                  marginRight: 5,
                                  verticalAlign: 'middle',
                                }}
                              />
                              {platformLabel(p.platform)}
                            </span>
                            <span
                              className="text-xs px-1.5 py-0.5"
                              style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
                            >
                              {formatLabel(p.format)}
                            </span>
                            <span className="text-xs" style={{ color: C.muted }}>
                              {new Date(p.published_at).toLocaleString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          </span>
                        </span>
                      </span>

                      <span className="text-xs tabular-nums" style={{ textAlign: 'right', color: C.muted }}>
                        {ageLabel(Number(p.age_hours))}
                      </span>
                      <span className="text-sm tabular-nums" style={{ textAlign: 'right', fontWeight: 600, color: C.text }}>
                        {compact(p.views)}
                      </span>
                      <AtAge value={p.views_24h} reached={reached24} label="24h" />
                      <AtAge value={p.views_72h} reached={reached72} label="72h" />
                      <span className="text-sm tabular-nums" style={{ textAlign: 'right', color: C.text }}>
                        {pct(p.engagement, p.views)}
                      </span>
                      <span className="text-sm tabular-nums" style={{ textAlign: 'right', color: C.text }}>
                        {p.saves === null ? '--' : p.saves}
                      </span>
                      <span>
                        {verdict ? (
                          <StatusBadge
                            status={{
                              level: verdict.level,
                              label: PERFORMANCE_LABEL[verdict.level],
                              shortLabel: verdict.label,
                              reason: verdict.why,
                            }}
                            compact
                          />
                        ) : (
                          <span
                            className="text-xs"
                            style={{ color: C.muted }}
                            title={
                              !reached24
                                ? 'This post is less than 24 hours old, so it has no 24 hour figure yet.'
                                : p.views_24h === null
                                  ? 'No snapshot was taken within 24 hours of this post being published.'
                                  : `Only ${peers} comparable post${peers === 1 ? '' : 's'} exist so far.`
                            }
                          >
                            {!reached24 ? 'Too new to judge' : 'Not enough comparable posts yet'}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <Note>
          Age-normalised history began on{' '}
          {coverage.firstSnapshot
            ? new Date(coverage.firstSnapshot).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
            : 'the first sync'}
          . {coverage.postsWith24h} of {coverage.totalPosts} posts currently have a snapshot within 24
          hours of publishing and {coverage.postsWith72h} within 72 hours. Older posts can never gain
          one, because Meta returns a post{"'"}s current totals rather than its history. This view
          fills in on its own as you publish. Running a{' '}
          <Link href="/admin/sync" style={{ color: C.text, textDecoration: 'underline' }}>
            manual sync
          </Link>{' '}
          a few hours after posting tightens the 24 hour reading considerably, because the scheduled
          job only runs once a day.
        </Note>
      </Panel>

      <Panel title="What this view does not answer" description="">
        <ul className="text-sm space-y-2" style={{ color: C.muted }}>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Whether your audience is growing.</span>{' '}
            That is a question about clicks, sessions and followers over time, and it lives on{' '}
            <Link href={withPeriod('/dashboard', period)} style={{ color: C.text, textDecoration: 'underline' }}>
              Overview
            </Link>{' '}
            and{' '}
            <Link href={withPeriod('/dashboard/growth', period)} style={{ color: C.text, textDecoration: 'underline' }}>
              Growth
            </Link>
            . Keep the two apart: a week where you published nothing can still grow your audience.
          </li>
          <li>
            <span style={{ color: C.text, fontWeight: 600 }}>Lifetime winners.</span> The{' '}
            <Link href={withPeriod('/dashboard/leaderboard', period)} style={{ color: C.text, textDecoration: 'underline' }}>
              Leaderboard
            </Link>{' '}
            ranks on cumulative views, which is the right measure for {'"'}what has reached the most
            people ever{'"'} and the wrong one for {'"'}is my newer work better{'"'}.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
