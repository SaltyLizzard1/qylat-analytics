import Link from 'next/link';
import { InfoTip } from '@/components/InfoTip';
import { ChartEmpty, PlatformChip, PostPicture, SampleChip } from '@/components/overview';
import { THRESHOLDS } from '@/lib/status';
import type { FormatAtAge } from '@/lib/cohort';
import type { DetailPost, FollowerSeries } from '@/lib/overview';
import {
  C,
  CARD,
  EYEBROW,
  RADIUS,
  TITLE,
  formatColor,
  formatLabel,
  full,
  markerFill,
  platformColor,
  platformLabel,
  shortDate,
} from '@/lib/theme';

/**
 * The parts of the Overview that answer three questions quickly: what worked,
 * what changed, and which posts to look at. Each chart row is a real link to
 * the posts behind it.
 */

/** One or two plain sentences of fact about the window, with how they were chosen behind the "i". */
export function Takeaway({ sentences, how }: { sentences: string[]; how: string }) {
  if (sentences.length === 0) return null;
  return (
    <section className="relative px-4 py-3.5 overflow-hidden" style={{ ...CARD, background: C.ink }}>
      <div className="flex items-start justify-between gap-3">
        <p style={{ ...EYEBROW, color: C.onInkMuted }}>In short</p>
        <span style={{ background: C.onInk, borderRadius: RADIUS.pill, lineHeight: 0 }}>
          <InfoTip text={how} about="how this summary is chosen" />
        </span>
      </div>
      <p className="mt-1" style={{ color: C.onInk, fontSize: '1.05rem', lineHeight: 1.45, fontWeight: 600, maxWidth: '75ch' }}>
        {sentences.join(' ')}
      </p>
    </section>
  );
}

/**
 * A follower trend at word size. No axis, so the two ends are printed beside
 * it and the range is never left to the eye. Drawn only when two readings
 * exist inside the window.
 */
function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const W = 96;
  const H = 30;
  const pad = 4;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} style={{ flexShrink: 0 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="3.5" fill={markerFill(color)} stroke={color} strokeWidth="2" />
    </svg>
  );
}

/**
 * The three accounts' follower totals in one compact strip. An account with a
 * history shows its trend and the two ends of it. An account with one reading
 * says "Baseline needed", which is a fact about the record, not a judgement
 * of the account. Each cell opens that account's detail.
 */
export function AudienceStrip({
  accounts,
  hrefFor,
}: {
  accounts: FollowerSeries[];
  hrefFor: (platform: string) => string;
}) {
  return (
    <section style={CARD} className="overflow-hidden" aria-label="Followers by account">
      <div className={`grid grid-cols-1 ${accounts.length > 1 ? 'md:grid-cols-3' : ''}`}>
        {accounts.map((a, i) => {
          const color = platformColor(a.platform);
          const first = a.points[0];
          const last = a.points[a.points.length - 1];
          const trend = a.points.length >= 2;
          return (
            <div
              key={a.platform}
              className="relative px-4 py-3 lift"
              style={{ borderTop: i > 0 ? `1px solid ${C.neutral}` : undefined, borderLeft: `5px solid ${color}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <PlatformChip platform={a.platform}>{platformLabel(a.platform)} followers</PlatformChip>
                <InfoTip text={`Followers gained in the window: ${a.gainedHow}.`} about={`${platformLabel(a.platform)} followers`} />
              </div>
              <div className="flex items-end justify-between gap-3 mt-1.5">
                <div className="min-w-0">
                  <p className="tabular-nums" style={{ ...TITLE, fontSize: '1.75rem', lineHeight: 1.05 }}>
                    <Link
                      href={hrefFor(a.platform)}
                      aria-label={`${platformLabel(a.platform)} followers: ${a.latest ? full(a.latest.followers) : 'not read'}. Open the details`}
                      className="after:absolute after:inset-0 after:content-['']"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {a.latest ? full(a.latest.followers) : 'Not read'}
                    </Link>
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    {a.gained === null ? (
                      'Change in this window not known'
                    ) : (
                      <>
                        <span className="tabular-nums" style={{ color: C.text, fontWeight: 700 }}>
                          {a.gained > 0 ? '+' : ''}
                          {full(a.gained)}
                        </span>{' '}
                        in this window
                      </>
                    )}
                    {a.latest ? `. Read ${shortDate(a.latest.recorded_on)}` : ''}
                  </p>
                </div>
                {trend ? (
                  <div className="flex flex-col items-end" style={{ flexShrink: 0 }}>
                    <Sparkline
                      values={a.points.map((p) => p.followers)}
                      color={color}
                      label={`${platformLabel(a.platform)} followers from ${full(first.followers)} on ${shortDate(first.recorded_on)} to ${full(
                        last.followers
                      )} on ${shortDate(last.recorded_on)}`}
                    />
                    <span className="text-xs tabular-nums" style={{ color: C.muted }}>
                      {full(first.followers)} to {full(last.followers)}
                    </span>
                  </div>
                ) : (
                  <span
                    className="text-xs px-2 py-1"
                    style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 600, flexShrink: 0 }}
                    title={
                      a.latest
                        ? `One reading inside this window, on ${shortDate(a.latest.recorded_on)}. A trend needs two.`
                        : 'No follower total has been stored for this account.'
                    }
                  >
                    Baseline needed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The first line of a caption, cut by code point so an emoji is never split. */
function oneLine(caption: string | null, max = 70): string {
  const first = (caption ?? '').split('\n').find((l) => l.trim()) ?? '';
  const chars = Array.from(first.trim());
  if (chars.length === 0) return 'No caption';
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : chars.join('');
}

/**
 * One account's most viewed posts in the window, as horizontal bars with the
 * post's picture. Bars share a scale inside the account only: accounts read
 * views differently, so a bar is never compared across cards. A post with no
 * views figure is not ranked and is counted in the note, never drawn as zero.
 */
export function TopPosts({
  platform,
  posts,
  hrefFor,
  allHref,
  info,
}: {
  platform: string;
  /** Every post the account published in the window, most viewed first. */
  posts: DetailPost[];
  hrefFor: (post: DetailPost) => string;
  /** The account's full post list for the window. */
  allHref: string;
  info: string;
}) {
  const color = platformColor(platform);
  const known = posts.filter((p) => p.views !== null);
  const top = known.slice(0, 5);
  const max = Math.max(1, ...top.map((p) => p.views ?? 0));
  return (
    <section className="p-4 pb-3" style={CARD}>
      <div className="flex items-center justify-between gap-2">
        <Link href={allHref} title="Open every post" style={{ textDecoration: 'none' }}>
          <PlatformChip platform={platform} />
        </Link>
        <InfoTip text={info} about={`${platformLabel(platform)} top posts`} />
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs mt-1.5 mb-2" style={{ color: C.muted }}>
        {posts.length === 0
          ? 'No posts in this window'
          : `Top ${top.length} of ${posts.length} post${posts.length === 1 ? '' : 's'}${
              known.length < posts.length ? `, ${known.length} with a views figure` : ''
            }`}
        {posts.length > 0 && posts.length < THRESHOLDS.minSamplePosts && <SampleChip>small sample</SampleChip>}
      </p>
      {posts.length === 0 ? (
        <ChartEmpty>No {platformLabel(platform)} posts published in this window.</ChartEmpty>
      ) : top.length === 0 ? (
        <ChartEmpty>No {platformLabel(platform)} post in this window has a views figure yet.</ChartEmpty>
      ) : (
        <ol className="flex flex-col">
          {top.map((p) => (
            <li key={p.id}>
              <Link
                href={hrefFor(p)}
                className="flex items-center gap-2.5 row-link px-2 py-1.5 -mx-2"
                style={{ textDecoration: 'none', borderRadius: RADIUS.md }}
                aria-label={`${oneLine(p.caption, 60)}: ${full(p.views)} views to date. Open in the post list`}
              >
                <PostPicture id={p.id} platform={p.platform} src={p.thumbnail_url} publishedAt={p.published_at} label={platformLabel(p.platform)} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs truncate" style={{ color: C.text, fontWeight: 600 }}>
                      {oneLine(p.caption)}
                    </span>
                    <span className="tabular-nums" style={{ color: C.text, fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em', flexShrink: 0 }}>
                      {full(p.views)}
                    </span>
                  </span>
                  <span style={{ display: 'block', height: 8, marginTop: 4 }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max(((p.views ?? 0) / max) * 100, (p.views ?? 0) > 0 ? 2 : 0)}%`,
                        background: color,
                        borderRadius: RADIUS.pill,
                      }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * One account's formats compared at the same age: the median views each
 * format had `age` hours after publishing. Every bar says how many posts it
 * rests on, and a format with too few says "small sample" in place of a
 * verdict. The card opens the Formats page, which lists every post behind it.
 */
export function FormatBars({
  platform,
  age,
  rows,
  hrefFor,
  info,
  caveat,
}: {
  platform: string;
  age: number;
  rows: FormatAtAge[];
  /** Where a format's posts are listed. */
  hrefFor: (format: string) => string;
  info: string;
  /** A limit of this account's figures that must be read with the bars, not behind a button. */
  caveat?: string;
}) {
  const sorted = [...rows].sort((a, b) => b.medianViews - a.medianViews);
  const max = Math.max(1, ...sorted.map((r) => r.medianViews));
  const measurable = rows[0]?.platformPosts ?? 0;
  return (
    <section className="p-4 pb-3" style={CARD}>
      <div className="flex items-center justify-between gap-2">
        <PlatformChip platform={platform} />
        <InfoTip text={info} about={`${platformLabel(platform)} formats`} />
      </div>
      <p className="text-xs mt-1.5 mb-2" style={{ color: C.muted }}>
        {sorted.length === 0
          ? `No post measured at ${age} hours yet`
          : `Measured at ${age} hours old. ${measurable} measurable post${measurable === 1 ? '' : 's'}, account median ${full(
              Math.round(rows[0].platformMedian)
            )}`}
      </p>
      {sorted.length === 0 ? (
        <ChartEmpty>
          No {platformLabel(platform)} post published in this window is {age} hours old with a reading that young.
        </ChartEmpty>
      ) : (
        <ul className="flex flex-col">
          {sorted.map((r) => {
            const small = r.posts < THRESHOLDS.minSamplePosts;
            return (
              <li key={r.format}>
                <Link
                  href={hrefFor(r.format)}
                  className="block row-link px-2 py-1.5 -mx-2"
                  style={{ textDecoration: 'none', borderRadius: RADIUS.md }}
                  aria-label={`${formatLabel(r.format)}: median ${full(Math.round(r.medianViews))} views at ${age} hours across ${r.posts} post${
                    r.posts === 1 ? '' : 's'
                  }${small ? ', a small sample' : ''}. Open the posts by format`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: C.text, fontWeight: 600 }}>
                      {formatLabel(r.format)}
                      <span className="text-xs" style={{ color: C.muted, fontWeight: 400 }}>
                        {r.posts} post{r.posts === 1 ? '' : 's'}
                      </span>
                      {small && <SampleChip>small sample</SampleChip>}
                    </span>
                    <span className="tabular-nums" style={{ color: C.text, fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em', flexShrink: 0 }}>
                      {full(Math.round(r.medianViews))}
                    </span>
                  </span>
                  <span style={{ display: 'block', height: 8, marginTop: 4 }}>
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max((r.medianViews / max) * 100, r.medianViews > 0 ? 2 : 0)}%`,
                        background: formatColor(r.format),
                        borderRadius: RADIUS.pill,
                      }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {caveat && sorted.length > 0 && (
        <p className="text-xs mt-2" style={{ color: C.muted }}>
          {caveat}
        </p>
      )}
    </section>
  );
}
