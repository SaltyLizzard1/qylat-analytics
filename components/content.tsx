import Link from 'next/link';
import { InfoTip } from '@/components/InfoTip';
import { PlatformChip, PostPicture, QuietChip, SampleChip } from '@/components/overview';
import { SOCIAL_PLATFORMS } from '@/lib/overview';
import { totalOf, type Copy, type Item, type Metric, type Total } from '@/lib/combined';
import { C, EYEBROW, RADIUS, TITLE, formatLabel, full, platformColor, platformLabel, shortDate, shortDateTime } from '@/lib/theme';

/**
 * The pieces the Content pages share: how a copy is named, how a combined
 * total says what it stands on, and the per-account bars under it. The rules
 * about what may be added are in lib/combined.ts. These only show them.
 */

/** The first line of a caption, cut by code point so an emoji is never split. */
export function oneLine(caption: string | null, max = 90): string {
  const first = (caption ?? '').split('\n').find((l) => l.trim()) ?? '';
  const chars = Array.from(first.trim());
  if (chars.length === 0) return 'No caption';
  return chars.length > max ? `${chars.slice(0, max).join('')}...` : chars.join('');
}

/** The copy whose picture and caption stand for the whole item: the first with an image, else the first. */
export function face(item: Item): Copy {
  return item.copies.find((c) => c.thumbnail_url) ?? item.copies.find((c) => (c.caption ?? '').trim()) ?? item.copies[0];
}

/**
 * Named for exactly what is in the sum. Until the Profile's figures are
 * stored with a known scope, the sum is Instagram and the Page, and is
 * called that instead of a total.
 */
const METRIC_NAME: Record<Metric, string> = {
  views: 'Instagram + Facebook Page views',
  comments: 'Instagram + Facebook Page comments',
  shares: 'Instagram + Facebook Page shares',
};

const METRIC_NOUN: Record<Metric, string> = { views: 'views', comments: 'comments', shares: 'shares' };

const METRIC_INFO: Record<Metric, string> = {
  views:
    'Instagram and Facebook Page views, each the post’s running total at its last read, added together. A sum of reported views, not unique viewers and not reach: one person watching on two accounts counts twice. Facebook Profile views are shown beside it and not included: they are stored without a confirmed scope. Checked in Facebook’s own screens on 6 October 2026, they behaved as running totals and did not contain Instagram’s views, but that check covers three posts. Instagram’s API reports fewer views for images and carousels than the app does.',
  comments:
    'Instagram and Facebook Page comments as of each last read, added together. Facebook Profile comments are shown per account and not included.',
  shares:
    'Instagram and Facebook Page shares as of each last read, added together. Facebook Profile shares are shown per account and not included. The Facebook Page reports shares only for some posts.',
};

function names(platforms: string[]): string {
  return platforms.map((p) => platformLabel(p)).join(' + ');
}

/**
 * A combined total, with everything that qualifies it in view: which
 * accounts are in the sum, "Partial" when a figure that belongs in it is
 * missing, and which accounts are shown apart because their scope is not
 * known. With `href` the figure is the link to the breakdown.
 */
export function TotalBlock({
  metric,
  total,
  item,
  href,
  size = 'large',
}: {
  metric: Metric;
  total: Total;
  /** The content the total is for, so a figure left out of the sum can be shown beside it. */
  item: Item;
  href?: string;
  size?: 'large' | 'small';
}) {
  const value = total.value === null ? 'No figure' : full(total.value);
  const figure = (
    <span
      className="tabular-nums"
      style={{
        ...TITLE,
        fontWeight: 800,
        fontSize: total.value === null ? '1.1rem' : size === 'large' ? '2rem' : '1.5rem',
        lineHeight: 1.1,
        color: total.value === null ? C.muted : C.text,
      }}
    >
      {value}
    </span>
  );
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5" style={EYEBROW}>
        {METRIC_NAME[metric]}
        <InfoTip text={METRIC_INFO[metric]} about={METRIC_NAME[metric]} />
      </p>
      {href ? (
        <Link
          href={href}
          aria-label={`${METRIC_NAME[metric]}: ${value}${total.partial ? ', partial' : ''}${
            total.apart.length > 0 ? `. ${names(total.apart)} not included` : ''
          }. Open the account breakdown`}
          style={{ textDecoration: 'none' }}
          className="inline-flex items-baseline gap-1.5"
        >
          {figure}
          <span aria-hidden className="text-sm" style={{ color: C.muted, fontWeight: 700 }}>
            →
          </span>
        </Link>
      ) : (
        figure
      )}
      <p className="flex flex-wrap items-center gap-1.5 text-xs mt-1" style={{ color: C.muted }}>
        {total.included.length > 0 ? <span>{names(total.included)}</span> : <span>No account has a figure to add</span>}
        {total.partial && (
          <span
            className="px-2 py-0.5"
            style={{ background: C.ink, color: C.onInk, borderRadius: RADIUS.pill, fontWeight: 700 }}
            title={`No figure for ${names(total.missing)}, so the total is short of it`}
          >
            Partial
          </span>
        )}
      </p>
      {item.copies
        .filter((c) => c.scope !== 'lifetime')
        .map((c) => (
          <p key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs mt-1" style={{ color: C.muted }}>
            <span>
              {platformLabel(c.platform)}:{' '}
              <span className="tabular-nums" style={{ color: C.text, fontWeight: 700 }}>
                {c[metric] === null ? missingLabel(c) : full(c[metric] as number)}
              </span>
              {c[metric] === null ? '' : ` ${METRIC_NOUN[metric]}`}
            </span>
            <SampleChip>Not included</SampleChip>
          </p>
        ))}
    </div>
  );
}

/**
 * What an account with no copy says. Nothing records that a piece of content
 * was deliberately not posted somewhere, so the page only says what it knows:
 * no copy has been linked.
 */
export const NO_COPY = 'No copy linked';

/** Why a copy has no figure for a metric: never read, or read and not given. */
export function missingLabel(c: Copy): string {
  return c.read_at === null ? 'Not read yet' : 'No figure';
}

/**
 * One metric by account, as bars in each account's colour on one scale. An
 * account with a copy and no figure says so in words and draws nothing. An
 * account with no copy says that, which is a different thing. A figure shown
 * apart from the total is marked.
 */
export function AccountBars({ item, metric }: { item: Item; metric: Metric }) {
  const total = totalOf(item, metric);
  const max = Math.max(1, ...item.copies.map((c) => c[metric] ?? 0));
  // The same account order on every card, whichever copy was published first.
  const copies = SOCIAL_PLATFORMS.flatMap((p) => item.copies.filter((c) => c.platform === p));
  return (
    <ul className="flex flex-col gap-2">
      {copies.map((c) => {
        const v = c[metric];
        return (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1.5 text-xs min-w-0" style={{ color: C.muted }}>
                <PlatformChip platform={c.platform} />
                {c.scope !== 'lifetime' && v !== null && <span>not included in the subtotal</span>}
              </span>
              <span
                className="tabular-nums"
                style={{ color: v === null ? C.muted : C.text, fontWeight: v === null ? 500 : 800, fontSize: v === null ? '0.8rem' : '1rem', flexShrink: 0 }}
              >
                {v === null ? missingLabel(c) : full(v)}
              </span>
            </div>
            {v !== null && (
              <div style={{ height: 8, marginTop: 4 }}>
                <div
                  style={{ height: '100%', width: `${Math.max((v / max) * 100, v > 0 ? 2 : 0)}%`, background: platformColor(c.platform), borderRadius: RADIUS.pill }}
                />
              </div>
            )}
          </li>
        );
      })}
      {total.absent.map((p) => (
        <li key={p} className="flex items-baseline justify-between gap-2">
          <PlatformChip platform={p} />
          <span className="text-xs" style={{ color: C.muted }}>
            {NO_COPY}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** When a copy was published, in its own account's terms. */
export function publishedText(c: Copy, withTime = false): string {
  if (c.published_label) return `${c.published_label}, as Facebook displayed it`;
  return withTime ? shortDateTime(c.published_at) : shortDate(c.published_at);
}

/** A copy at row size: picture, caption, account, format and publish date. */
export function CopyLine({ c, size = 48 }: { c: Copy; size?: number }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <PostPicture id={c.id} platform={c.platform} src={c.thumbnail_url} publishedAt={c.published_at} label={platformLabel(c.platform)} size={size} />
      <div className="min-w-0">
        <p className="text-sm truncate" style={{ color: C.text, fontWeight: 600 }}>
          {oneLine(c.caption)}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 mt-1 text-xs" style={{ color: C.muted }}>
          <PlatformChip platform={c.platform} />
          {c.format && <QuietChip>{formatLabel(c.format)}</QuietChip>}
          <span>Published {publishedText(c)}</span>
        </p>
      </div>
    </div>
  );
}
