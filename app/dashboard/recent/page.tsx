import Link from 'next/link';
import { getAgeNormalisedComparison, getRecentPosts, getAgeCoverage, type RecentPost } from '@/lib/cohort';
import {
  parsePeriod,
  parseAge,
  applyPeriod,
  periodPhrase,
  AGE_CHOICES,
  withPeriod,
} from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { PageHeader, SectionHeading, Empty, Note, Disclosure } from '@/components/charts';
import { CompareBars, DateTile, FigureBar, FilterBar, PlatformChip, QuietChip } from '@/components/overview';
import { StatusBadge } from '@/components/status';
import { PostThumb } from '@/components/PostThumb';
import { PERFORMANCE_SHORT, PERFORMANCE_LABEL, type Level } from '@/lib/status';
import {
  C,
  CARD,
  EYEBROW,
  RADIUS,
  TITLE,
  compact,
  full,
  pct,
  platformLabel,
  formatLabel,
  platformColor,
  shortDate,
  shortDateTime,
} from '@/lib/theme';

export const dynamic = 'force-dynamic';

/** A judgement needs at least this many comparable posts behind it. */
const MIN_PEERS = 4;

function ageLabel(hours: number): string {
  if (hours < 48) return `${Math.max(Math.round(hours), 0)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function changePct(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || !previous) return null;
  const c = ((current - previous) / previous) * 100;
  return `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`;
}

/**
 * One headline figure for the cohort, with this period and the previous one
 * drawn as two bars on one scale. The earlier bar is neutral grey and the
 * change is stated in ink: a lower figure is a fact here, not a verdict.
 */
function CohortTile({
  label,
  value,
  current,
  previous,
  format,
  change,
  comparing,
}: {
  label: string;
  /** The figure as shown, or "--" when there is none. */
  value: string;
  current: number | null;
  previous: number | null;
  format: (n: number) => string;
  /** A percentage change, only where it was already reported. */
  change?: string | null;
  comparing: boolean;
}) {
  return (
    <div className="px-4 pt-3.5 pb-4" style={CARD}>
      <p style={EYEBROW}>{label}</p>
      <p className="tabular-nums mt-1.5" style={{ ...TITLE, fontSize: 'clamp(1.9rem, 5.2vw, 2.6rem)', lineHeight: 1.05 }}>
        {value}
      </p>
      {comparing && current !== null && previous !== null && (
        <div className="mt-3">
          <CompareBars current={current} previous={previous} currentLabel="This period" previousLabel="Previous" format={format} />
          {change && (
            <p className="text-xs mt-1.5 tabular-nums" style={{ color: C.text, fontWeight: 700 }}>
              {change}{' '}
              <span style={{ color: C.muted, fontWeight: 400 }}>against the previous period</span>
            </p>
          )}
        </div>
      )}
      {comparing && current !== null && previous === null && (
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          No figure for the previous period
        </p>
      )}
    </div>
  );
}

/** A reading at a fixed age. It only exists once the post has reached that age. */
function AtAgeFigure({ value, reached, label }: { value: number | null; reached: boolean; label: string }) {
  const text = !reached ? 'Not yet' : value === null ? 'No snapshot' : full(value);
  const real = reached && value !== null;
  return (
    <div title={!reached ? `Not yet ${label} old` : value === null ? `No snapshot within ${label} of publishing` : undefined}>
      <p style={{ ...EYEBROW, fontSize: '0.68rem' }}>At {label}</p>
      <p
        className="tabular-nums"
        style={{
          color: real ? C.text : C.muted,
          fontWeight: real ? 800 : 500,
          fontSize: real ? '1.05rem' : '0.8rem',
          letterSpacing: '-0.02em',
          lineHeight: 1.3,
        }}
      >
        {text}
      </p>
    </div>
  );
}

/** A small labelled figure in a post row. */
function Small({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <p style={{ ...EYEBROW, fontSize: '0.68rem' }}>{label}</p>
      <p className="tabular-nums" style={{ color: C.text, fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em', lineHeight: 1.3 }}>
        {value}
      </p>
    </div>
  );
}

/**
 * One recent post: what it is, then how it did at the same age as every other
 * post in the list. The 24 hour bar is drawn on one scale down the page,
 * because 24 hour figures are comparable. Views now is a plain number beside
 * the post's age, with no bar: posts of different ages are not comparable on a
 * running total, and a bar would invite that comparison.
 */
function RecentRow({ p, max24 }: { p: RecentPost; max24: number }) {
  const peers = p.peer_count_24h ?? 0;

  /*
   * A post that has not lived N hours has no N-hour figure. The query
   * correctly takes the latest snapshot at or before the target, but for an
   * 18 hour old post that snapshot is an 18 hour reading, and showing it under
   * "At 72h" claims a measurement that does not exist yet.
   */
  const reached24 = Number(p.age_hours) >= 24;
  const reached72 = Number(p.age_hours) >= 72;
  // The post itself is inside the peer set, so require one more than the
  // minimum before the comparison means anything.
  const usable = reached24 && p.views_24h !== null && p.peer_median_24h !== null && peers > MIN_PEERS;
  let verdict: { level: Level; label: string; why: string } | null = null;
  if (usable) {
    const ratio = (p.views_24h as number) / (p.peer_median_24h as number);
    const level: Level = ratio >= 1.3 ? 'good' : ratio >= 0.7 ? 'warning' : 'bad';
    verdict = {
      level,
      label: PERFORMANCE_SHORT[level],
      why: `${Math.round(ratio * 100)}% of the ${Math.round(p.peer_median_24h as number)} median 24h views across ${peers} ${platformLabel(
        p.platform
      )} ${formatLabel(p.format).toLowerCase()}s`,
    };
  }
  const whole = (p.caption ?? 'Untitled post').replace(/\s+/g, ' ').trim();
  const chars = Array.from(whole);
  const caption = chars.length > 110 ? `${chars.slice(0, 110).join('')}...` : whole;
  const [day, month = ''] = shortDate(p.published_at).split(' ');
  const color = platformColor(p.platform);

  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-3 p-3" style={{ ...CARD, borderRadius: RADIUS.md }}>
      <div className="flex items-center gap-3 min-w-0" style={{ flex: '1 1 300px' }}>
        <PostThumb
          src={p.thumbnail_url}
          recoverSrc={p.platform === 'facebook-personal' ? undefined : `/api/thumb/${p.id}`}
          label={formatLabel(p.format)}
          size={64}
          fallback={<DateTile day={day} month={month} color={color} size={64} title={`Published ${day} ${month}. No image could be loaded for this post`} />}
        />
        <div className="min-w-0">
          <p className="text-sm" style={{ color: C.text, fontWeight: 600, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
            {p.permalink ? (
              <a href={p.permalink} target="_blank" rel="noopener noreferrer" style={{ color: C.text, textDecoration: 'none' }} title="Open the post">
                {caption}
              </a>
            ) : (
              caption
            )}
          </p>
          <p className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <PlatformChip platform={p.platform} />
            <QuietChip>{formatLabel(p.format)}</QuietChip>
            <span className="text-xs" style={{ color: C.muted }}>
              {shortDateTime(p.published_at)}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-2 items-end" style={{ flex: '1 1 300px' }}>
        <div className="col-span-3">
          {reached24 && p.views_24h !== null ? (
            <FigureBar label="Views at 24h" value={p.views_24h} max={max24} color={color} emphasis />
          ) : (
            <div
              title={
                !reached24
                  ? 'This post is less than 24 hours old, so it has no 24 hour figure yet.'
                  : 'No snapshot was taken within 24 hours of this post being published.'
              }
            >
              <p style={{ ...EYEBROW, fontSize: '0.68rem' }}>Views at 24h</p>
              <p className="text-sm" style={{ color: C.muted }}>
                {!reached24 ? 'Not yet 24 hours old' : 'No snapshot within 24 hours'}
              </p>
            </div>
          )}
        </div>
        <AtAgeFigure value={p.views_72h} reached={reached72} label="72h" />
        <Small
          label={`Now, ${ageLabel(Number(p.age_hours))}`}
          value={compact(p.views)}
          title="Total views to date. Not comparable between posts of different ages."
        />
        <Small label="Eng. rate" value={pct(p.engagement, p.views)} />
      </div>

      <div className="flex items-center justify-between gap-4" style={{ flex: '0 1 220px' }}>
        <Small label="Saves" value={p.saves === null ? '--' : String(p.saves)} />
        <div style={{ textAlign: 'right' }}>
          <p style={{ ...EYEBROW, fontSize: '0.68rem' }} className="mb-1">
            Versus peers
          </p>
          {verdict ? (
            <StatusBadge
              status={{ level: verdict.level, label: PERFORMANCE_LABEL[verdict.level], shortLabel: verdict.label, reason: verdict.why }}
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
        </div>
      </div>
    </li>
  );
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
    getAgeNormalisedComparison({ ageHours: age.hours, period }),
    getRecentPosts(Math.max(period.days, 14)),
    getAgeCoverage(),
  ]);

  const enough = cmp.current.posts >= 1 && cmp.previous.posts >= 1;
  const thin = cmp.current.posts < MIN_PEERS || cmp.previous.posts < MIN_PEERS;
  const comparing = period.compare === 'previous';
  const max24 = Math.max(1, ...posts.filter((p) => Number(p.age_hours) >= 24).map((p) => p.views_24h ?? 0));
  const rate = (n: number) => `${(n * 100).toFixed(1)}%`;
  const one = (n: number) => n.toFixed(1);
  const round = (n: number) => full(Math.round(n));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recent Posts"
        meta={[
          { label: 'Comparable at 24h', value: `${coverage.postsWith24h} of ${coverage.totalPosts}` },
          { label: 'At 72h', value: `${coverage.postsWith72h} of ${coverage.totalPosts}` },
          {
            label: 'History from',
            value: coverage.firstSnapshot ? shortDate(coverage.firstSnapshot) : 'first sync',
          },
        ]}
      />

      <FilterBar>
        <PeriodPicker period={period} bare />
        {/* Age is its own control: it selects WHEN in a post's life to measure. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span style={EYEBROW}>Measured at</span>
          <div className="flex gap-0.5 p-0.5" role="group" aria-label="Measured at" style={{ background: C.neutral, borderRadius: RADIUS.md }}>
            {AGE_CHOICES.map((a) => {
              const active = a.hours === age.hours;
              const q = new URLSearchParams({ age: String(a.hours) });
              applyPeriod(q, period);
              return (
                <Link
                  key={a.hours}
                  href={`/dashboard/recent?${q.toString()}`}
                  aria-current={active ? 'true' : undefined}
                  className="text-xs px-2.5 py-1.5"
                  style={{
                    borderRadius: RADIUS.sm,
                    textDecoration: 'none',
                    background: active ? C.ink : 'transparent',
                    color: active ? C.onInk : C.text,
                    fontWeight: active ? 700 : 500,
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
      </FilterBar>

      <Disclosure summary="Why this page exists, and why it is the one to trust for newer work">
        Posts are compared at the same age after publishing, never on lifetime totals. A post from
        this week has had days to accumulate views; one from June has had months, so comparing their
        running totals measures age rather than performance. Every other view that shows lifetime
        figures says so in its own label. This is the one that answers whether your newer work is
        performing better.
      </Disclosure>

      <SectionHeading
        note={
          comparing
            ? `Against posts published in ${period.compareLabel}, measured at the same ${age.short} point in their own lives. Like for like.`
            : 'Comparison hidden. Turn it back on in the period control above.'
        }
      >
        {`Posts published ${periodPhrase(period)}, at ${age.short}`}
      </SectionHeading>

      {!enough ? (
        <Empty message="Not enough comparable posts yet." />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <CohortTile
            label={`Posts with a ${age.short} snapshot`}
            value={full(cmp.current.posts)}
            current={cmp.current.posts}
            previous={cmp.previous.posts}
            format={full}
            comparing={comparing}
          />
          <CohortTile
            label={`Median views at ${age.short}`}
            value={cmp.current.medianViews === null ? '--' : round(cmp.current.medianViews)}
            current={cmp.current.medianViews}
            previous={cmp.previous.medianViews}
            format={round}
            change={changePct(cmp.current.medianViews, cmp.previous.medianViews)}
            comparing={comparing}
          />
          <CohortTile
            label={`Median engagement rate at ${age.short}`}
            value={cmp.current.medianEngagementRate === null ? '--' : rate(cmp.current.medianEngagementRate)}
            current={cmp.current.medianEngagementRate}
            previous={cmp.previous.medianEngagementRate}
            format={rate}
            comparing={comparing}
          />
          <CohortTile
            label="Saves per 1,000 views"
            value={cmp.current.savesPer1k === null ? '--' : one(cmp.current.savesPer1k)}
            current={cmp.current.savesPer1k}
            previous={cmp.previous.savesPer1k}
            format={one}
            comparing={comparing}
          />
        </div>
      )}

      {thin && enough && (
        <Note>
          Both cohorts are small, so read this as a direction rather than a measurement. A single
          unusual post moves a median of three or four.
        </Note>
      )}

      {(cmp.currentMissing > 0 || cmp.previousMissing > 0) && (
        <Disclosure
          summary={`${cmp.currentMissing + cmp.previousMissing} ${
            cmp.currentMissing + cmp.previousMissing === 1 ? 'post is' : 'posts are'
          } excluded for having no ${age.short} snapshot`}
        >
          {cmp.currentMissing} in this period and {cmp.previousMissing} in the previous one have no
          snapshot taken within {age.short} of publishing, so they are excluded rather than compared
          on a later reading, which would flatter them. Snapshots only began on{' '}
          {coverage.firstSnapshot ? shortDate(coverage.firstSnapshot) : 'the first sync'}, and Meta
          returns a post{"'"}s current totals rather than its history, so earlier posts can never
          gain one.
        </Disclosure>
      )}

      <SectionHeading
        note={`Published in the last ${Math.max(period.days, 14)} days. The 24 hour bars share one scale, so their lengths compare down the page.`}
      >
        Every recent post
      </SectionHeading>

      {posts.length === 0 ? (
        <Empty message="No posts published in this window." />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {posts.map((p) => (
            <RecentRow key={p.id} p={p} max24={max24} />
          ))}
        </ul>
      )}

      <div className="flex flex-col items-start gap-2">
        <Disclosure summary="How the Versus peers verdict is worked out">
          Each post is compared against the median of same platform, same format posts measured at{' '}
          {age.short}. The post itself sits inside that peer set, so more than {MIN_PEERS} comparable
          posts are needed before the comparison means anything, and below that the row says so rather
          than guessing. A post younger than the measurement age has no reading yet and says that too.
        </Disclosure>
        <Disclosure summary="How to get more posts into this comparison">
          Older posts can never gain a snapshot, because Meta returns a post{"'"}s current totals
          rather than its history, so this view fills in only as you publish. Running a{' '}
          <Link href="/admin/sync" style={{ color: C.text, textDecoration: 'underline' }}>
            manual sync
          </Link>{' '}
          a few hours after posting tightens the 24 hour reading considerably, because the scheduled
          job runs only once a day.
        </Disclosure>
        <Disclosure summary="Two questions this page does not answer">
          <ul className="space-y-2">
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
        </Disclosure>
      </div>
    </div>
  );
}
