import { getLeaderboard, getPlatformMedians } from '@/lib/queries';
import { parsePeriod, periodPhrase } from '@/lib/period';
import { PeriodPicker } from '@/components/PeriodPicker';
import { Panel, Empty, PageHeader, Disclosure } from '@/components/charts';
import { StatusBadge } from '@/components/status';
import { PostPicture } from '@/components/overview';
import { performanceStatus, THRESHOLDS, type Level } from '@/lib/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { pillarLabel } from '@/lib/pillars';
import { C, RADIUS, compact, pct, shortDate, platformLabel, formatLabel, platformColor } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * The badge on this page measures engagement rate, so it says so. Views
 * performance is already carried by the rank and the bar, and a bare "Weak"
 * next to the top post by views reads as a judgement on the whole post.
 */
const ENGAGEMENT_LABEL: Record<Level, string> = {
  good: 'High engagement',
  warning: 'Medium engagement',
  bad: 'Low engagement',
};

const ENGAGEMENT_SHORT: Record<Level, string> = {
  good: 'High',
  warning: 'Medium',
  bad: 'Low',
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; compare?: string }>;
}) {
  const period = parsePeriod(await searchParams);
  const [rows, medians] = await Promise.all([
    getLeaderboard(30, period),
    getPlatformMedians(period),
  ]);

  const topViews = Math.max(...rows.map((r) => (r.views as number) ?? 0), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Post Leaderboard"
        meta={[
          { label: 'Posts ranked', value: String(rows.length) },
          {
            label: 'Median eng. rate',
            value: `Instagram ${((medians.instagram?.engagementRate ?? 0) * 100).toFixed(1)}%, Facebook ${((medians.facebook?.engagementRate ?? 0) * 100).toFixed(1)}%`,
          },
        ]}
      />

      <Disclosure summary="Why the badge measures engagement, not views">
        The list is ranked by views, so rank already tells you which posts got seen and a badge
        repeating that would be noise. The badge measures something else: engagement rate against
        your own median for that platform. That is what separates rows near the top, and it means a
        top post carrying a low badge reached plenty of people who did not react, which is a finding
        rather than a failure.
      </Disclosure>

      <PeriodPicker period={period} />

      {/*
        Legend names the dimension. "Weak" on its own reads as a verdict on the
        post, which is wrong beside the number one post by views: that post
        reached the most people and got no interactions, which is a finding
        about engagement, not a bad post.
      */}
      <div className="flex flex-wrap items-center gap-4">
        {(
          [
            ['good', severityGood],
            ['warning', severityWarning],
            ['bad', severityBad],
          ] as const
        ).map(([level, style]) => (
          <span key={level} className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: style.color }} />
            {ENGAGEMENT_LABEL[level]}
          </span>
        ))}
      </div>

      <Panel
        title={`Top ${Math.min(rows.length, 30)} posts published ${periodPhrase(period)}`}
        description="Ranked by lifetime views as they stand today."
      >
        {rows.length === 0 ? (
          <Empty message="No posts synced yet. Run the Meta sync first." />
        ) : (
          <>
            {/*
              Header row. Widths mirror the row below exactly, so the labels sit
              over the columns they describe. The badge column says
              "Engagement", which is what makes High / Medium / Low mean
              something on its own.
            */}
            <div
              className="flex items-center gap-3 px-3 pb-2 mb-2"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              <HeadCell width="1.4rem" align="right">
                #
              </HeadCell>
              <HeadCell width="44px" />
              <div className="flex-1 min-w-0">
                <HeadCell>Post</HeadCell>
              </div>
              <div className="hidden sm:block flex-shrink-0" style={{ width: 90 }} />
              <HeadCell width="4.2rem" align="right">
                Views
              </HeadCell>
              <HeadCell width="6.2rem">Engagement</HeadCell>
            </div>

            <ol className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const caption = ((r.caption as string) ?? '').replace(/\s+/g, ' ').trim();
              const permalink = r.permalink as string | null;
              const views = r.views as number | null;
              const engagement = r.engagement as number | null;
              const platform = r.platform as string;
              // Views vs median would read Strong on every row of a list
              // sorted by views. Engagement rate is what separates a post that
              // got seen from one that got seen and landed.
              // engagement may legitimately be 0. Only a null is unknown.
              const rate =
                views && views > 0 && engagement !== null && engagement !== undefined
                  ? engagement / views
                  : null;
              const median = medians[platform]?.engagementRate ?? null;
              const base = performanceStatus(rate, median, 'engagement rate');
              const status = base
                ? {
                    ...base,
                    label: ENGAGEMENT_LABEL[base.level],
                    shortLabel: ENGAGEMENT_SHORT[base.level],
                  }
                : null;
              // Below the floor there is no baseline, which is a different
              // thing from too little data, and the badge should say which.
              const noBaseline =
                median !== null && median < THRESHOLDS.minMedianRate
                  ? {
                      label: 'No baseline',
                      reason: `${platformLabel(platform)}'s median engagement rate is ${(median * 100).toFixed(1)}%, below the ${(THRESHOLDS.minMedianRate * 100).toFixed(0)}% floor, so there is nothing to judge against yet`,
                    }
                  : undefined;
              const theme = r.content_theme as string | null;

              return (
                <li
                  key={r.id as number}
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: RADIUS.md,
                  }}
                >
                  <span
                    className="tabular-nums text-xs flex-shrink-0 text-right"
                    style={{ color: C.muted, width: '1.4rem' }}
                  >
                    {i + 1}
                  </span>

                  <PostPicture
                    id={Number(r.id)}
                    platform={platform}
                    src={r.thumbnail_url as string | null}
                    publishedAt={(r.published_at as string) ?? null}
                    label={formatLabel(r.format as string)}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate mb-1" style={{ color: C.text }}>
                      {permalink ? (
                        <a
                          href={permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: C.text, textDecoration: 'none' }}
                        >
                          {caption || 'Untitled post'}
                        </a>
                      ) : (
                        caption || 'Untitled post'
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Chip>
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: platformColor(platform),
                            marginRight: 5,
                            verticalAlign: 'middle',
                          }}
                        />
                        {platformLabel(platform)}
                      </Chip>
                      <Chip>{formatLabel(r.format as string)}</Chip>
                      {theme && <Chip>{pillarLabel(theme)}</Chip>}
                      <span className="text-xs" style={{ color: C.muted }}>
                        {shortDate(r.published_at as string)}
                      </span>
                    </div>
                  </div>

                  {/* Inline bar: length against the top post, so rank is visible at a glance. */}
                  <div className="hidden sm:block flex-shrink-0" style={{ width: 90 }}>
                    <div style={{ height: 8 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(((views ?? 0) / topViews) * 100, 2)}%`,
                          background: platformColor(platform),
                          borderRadius: RADIUS.pill,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right" style={{ width: '4.2rem' }}>
                    <p className="tabular-nums text-sm" style={{ fontWeight: 600, color: C.text }}>
                      {compact(views)}
                    </p>
                  </div>

                  <div className="flex-shrink-0" style={{ width: '6.2rem' }}>
                    <StatusBadge status={status} compact empty={noBaseline} />
                    <p className="text-xs mt-0.5 tabular-nums" style={{ color: C.muted }}>
                      {pct(engagement, views)}
                    </p>
                  </div>
                </li>
              );
              })}
            </ol>
          </>
        )}

        <Disclosure summary="The thresholds behind High, Medium and Low, and what No baseline means">
          High is at least 1.3 times your median engagement rate for that platform, Low is below 0.7
          times, Medium is between. A platform whose own median rate sits below 1% shows No baseline
          instead, because a comparison against nearly nothing would call every post High. Ranking
          is on views rather than reach, because Meta returns zero reach for every Facebook Page
          post. Posts published earlier in the window have had longer to accumulate views, so for a
          like-for-like read at the same age use Recent Posts.
        </Disclosure>
      </Panel>
    </div>
  );
}

function HeadCell({
  children,
  width,
  align = 'left',
}: {
  children?: React.ReactNode;
  width?: string;
  align?: 'left' | 'right';
}) {
  return (
    <span
      className="uppercase flex-shrink-0 whitespace-nowrap"
      style={{ color: C.muted, fontSize: '0.75rem', letterSpacing: '0.03em', width, textAlign: align }}
    >
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
    >
      {children}
    </span>
  );
}
