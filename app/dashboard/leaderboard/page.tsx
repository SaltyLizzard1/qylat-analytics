import { getLeaderboard, getPlatformMedians } from '@/lib/queries';
import { Panel, Empty, Note, PageHeader } from '@/components/charts';
import { StatusBadge } from '@/components/status';
import { PostThumb } from '@/components/PostThumb';
import { performanceStatus, type Level } from '@/lib/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import { pillarLabel } from '@/lib/pillars';
import { C, RADIUS, compact, pct, shortDate, platformLabel, formatLabel } from '@/lib/theme';

export const dynamic = 'force-dynamic';

/**
 * The badge on this page measures engagement rate, so it says so. Views
 * performance is already carried by the rank and the bar, and a bare "Weak"
 * next to the top post by views reads as a judgement on the whole post.
 */
const ENGAGEMENT_LABEL: Record<Level, string> = {
  good: 'High engagement',
  warning: 'Typical engagement',
  bad: 'Low engagement',
};

const ENGAGEMENT_SHORT: Record<Level, string> = {
  good: 'High eng',
  warning: 'Typical eng',
  bad: 'Low eng',
};

export default async function LeaderboardPage() {
  const [rows, medians] = await Promise.all([getLeaderboard(30), getPlatformMedians()]);

  const topViews = Math.max(...rows.map((r) => (r.views as number) ?? 0), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Post Leaderboard"
        lead="Ranked by views. The badge measures engagement rate against your own median for that platform, so it describes interaction, not the post. A top post with low engagement reached plenty of people who did not react, which is a finding rather than a failure."
      />

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
        <span className="text-xs" style={{ color: C.muted }}>
          Median engagement rate: Instagram{' '}
          {((medians.instagram?.engagementRate ?? 0) * 100).toFixed(1)}%, Facebook{' '}
          {((medians.facebook?.engagementRate ?? 0) * 100).toFixed(1)}%
        </span>
      </div>

      <Panel title={`Top ${Math.min(rows.length, 30)} posts`}>
        {rows.length === 0 ? (
          <Empty message="No posts synced yet. Run the Meta sync first." />
        ) : (
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
              const base = performanceStatus(
                rate,
                medians[platform]?.engagementRate ?? null,
                'engagement rate'
              );
              const status = base
                ? {
                    ...base,
                    label: ENGAGEMENT_LABEL[base.level],
                    shortLabel: ENGAGEMENT_SHORT[base.level],
                  }
                : null;
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

                  <PostThumb src={r.thumbnail_url as string | null} label={formatLabel(r.format as string)} />

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
                      <Chip>{platformLabel(platform)}</Chip>
                      <Chip>{formatLabel(r.format as string)}</Chip>
                      {theme && <Chip>{pillarLabel(theme)}</Chip>}
                      <span className="text-xs" style={{ color: C.muted }}>
                        {shortDate(r.published_at as string)}
                      </span>
                    </div>
                  </div>

                  {/* Inline bar: length against the top post, so rank is visible at a glance. */}
                  <div className="hidden sm:block flex-shrink-0" style={{ width: 90 }}>
                    <div style={{ height: 5 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(((views ?? 0) / topViews) * 100, 2)}%`,
                          background: C.text,
                          borderRadius: RADIUS.pill,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex-shrink-0 text-right" style={{ minWidth: '4.2rem' }}>
                    <p className="tabular-nums text-sm" style={{ fontWeight: 600, color: C.text }}>
                      {compact(views)}
                    </p>
                    <p className="text-xs" style={{ color: C.muted }}>
                      {pct(engagement, views)} eng
                    </p>
                  </div>

                  <div className="flex-shrink-0" style={{ minWidth: '5.2rem' }}>
                    <StatusBadge status={status} compact />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <Note>
          Ranked on views, because Meta returns zero reach for every Facebook Page post. The label
          measures something else: engagement rate against the median for that platform. Rank
          already tells you which posts got seen, so a badge repeating it would be noise. This tells
          you which ones got seen <em>and</em> landed, which is the more useful question and the one
          that separates rows near the top. Strong is at least 1.3 times your median rate, weak is
          below 0.7 times.
        </Note>
      </Panel>
    </div>
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
