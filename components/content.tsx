import Link from 'next/link';
import { InfoTip } from '@/components/InfoTip';
import { PlatformChip, PostPicture, QuietChip, SampleChip } from '@/components/overview';
import { SOCIAL_PLATFORMS } from '@/lib/overview';
import { THRESHOLDS } from '@/lib/status';
import { isStale, totalOf, type Copy, type Item, type Metric, type Total } from '@/lib/combined';
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

const METRIC_NOUN: Record<Metric, string> = { views: 'views', comments: 'comments', shares: 'shares' };

/**
 * Named for exactly what is in the sum. "Total reported views" when every
 * linked copy's figure is in it. When a copy's figure is left out because
 * its stored scope is unknown, the sum is named for the accounts it does
 * hold, so a subtotal is never called a total.
 */
export function totalName(metric: Metric, total: Total): string {
  if (total.apart.length === 0) return `Total reported ${METRIC_NOUN[metric]}`;
  const counted = [...total.included, ...total.missing];
  const ordered = SOCIAL_PLATFORMS.filter((p) => counted.includes(p));
  return ordered.length > 0 ? `${names(ordered)} ${METRIC_NOUN[metric]}` : `Reported ${METRIC_NOUN[metric]}`;
}

/** Why a copy's figure is beside the sum and not in it. Brief, and specific to the figure. */
function apartReason(metric: Metric): string {
  return metric === 'views' ? 'Not included: recorded before its scope was confirmed' : 'Not included: scope not confirmed';
}

const METRIC_INFO: Record<Metric, string> = {
  views:
    'Each account’s running total of views at its own last read, added together. A sum of reported views, not unique viewers and not reach: one person watching on two accounts counts twice. The figures are the latest recorded for each account and were not read at the same moment. A Facebook Profile figure is added only when it was collected with a confirmed scope. Earlier Profile figures are shown beside the sum and not included. Instagram’s API reports fewer views for images and carousels than the app does.',
  comments:
    'Instagram and Facebook Page comments at each last read, added together. Facebook Profile comments are shown per account and not included: their scope has not been confirmed.',
  shares:
    'Instagram and Facebook Page shares at each last read, added together. Facebook Profile shares are shown per account and not included: their scope has not been confirmed. The Facebook Page reports shares only for some posts.',
};

function names(platforms: string[]): string {
  return platforms.map((p) => platformLabel(p)).join(' + ');
}

/** "read 5 Oct", or "read 25 Sept to 5 Oct" when the figures were read on different days. */
function readSpan(total: Total): string {
  if (!total.readFrom || !total.readTo) return '';
  const from = shortDate(total.readFrom);
  const to = shortDate(total.readTo);
  return from === to ? `read ${to}` : `read ${from} to ${to}`;
}

/**
 * A combined total, with everything that qualifies it in view: which
 * accounts are in the sum, that the figures are the latest recorded and on
 * which days they were read, "Partial" when a figure that belongs in it is
 * missing, "Stale" when one reading is well behind the others, and any
 * figure left out because its scope is unknown. With `href` the figure is
 * the link to the breakdown.
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
  const name = totalName(metric, total);
  const value = total.value === null ? 'No figure' : full(total.value);
  const span = readSpan(total);
  const figure = (
    <span
      className="tabular-nums"
      style={{
        ...TITLE,
        fontWeight: 600,
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
        {name}
        <InfoTip text={METRIC_INFO[metric]} about={name} />
      </p>
      {href ? (
        <Link
          href={href}
          aria-label={`${name}: ${value}${total.partial ? ', partial' : ''}${
            total.apart.length > 0 ? `. ${names(total.apart)} not included` : ''
          }. Latest recorded figures${span ? `, ${span}` : ''}. Open the account breakdown`}
          style={{ textDecoration: 'none' }}
          className="inline-flex items-baseline gap-1.5"
        >
          {figure}
          <span aria-hidden className="text-sm" style={{ color: C.muted, fontWeight: 600 }}>
            →
          </span>
        </Link>
      ) : (
        figure
      )}
      <p className="text-xs mt-1" style={{ color: C.muted }}>
        <span style={{ color: C.text, fontWeight: 600 }}>Latest recorded figures</span>
        {span ? ` · ${span}` : ''}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-xs mt-1" style={{ color: C.muted }}>
        {total.included.length > 0 ? <span>{names(total.included)}</span> : <span>No account has a figure to add</span>}
        {total.partial && (
          <span
            className="px-2 py-0.5"
            style={{ background: C.ink, color: C.onInk, borderRadius: RADIUS.pill, fontWeight: 600 }}
            title={`No figure for ${names(total.missing)}, so the total is short of it`}
          >
            Partial
          </span>
        )}
        {total.stale.length > 0 && (
          <span
            className="px-2 py-0.5"
            style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 600 }}
            title={`${names(total.stale)} was read more than ${THRESHOLDS.staleReadHours} hours before the newest reading for this content`}
          >
            Stale reading: {names(total.stale)}
          </span>
        )}
      </p>
      {item.copies
        .filter((c) => c.scope[metric] !== 'lifetime')
        .map((c) => (
          <p key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs mt-1" style={{ color: C.muted }}>
            <span>
              {platformLabel(c.platform)}:{' '}
              <span className="tabular-nums" style={{ color: C.text, fontWeight: 600 }}>
                {c[metric] === null ? missingLabel(c) : full(c[metric] as number)}
              </span>
              {c[metric] === null ? '' : ` ${METRIC_NOUN[metric]}`}
            </span>
            <SampleChip>{apartReason(metric)}</SampleChip>
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
 * account with no copy says "No copy linked", which is a different thing. A
 * figure left out of the sum is marked. With `detail`, each account also
 * shows its share of the sum and the day it was read, with a stale reading
 * flagged: the figures are the latest recorded, not one moment.
 */
export function AccountBars({ item, metric, detail = false }: { item: Item; metric: Metric; detail?: boolean }) {
  const total = totalOf(item, metric);
  const max = Math.max(1, ...item.copies.map((c) => c[metric] ?? 0));
  // The same account order on every card, whichever copy was published first.
  const copies = SOCIAL_PLATFORMS.flatMap((p) => item.copies.filter((c) => c.platform === p));
  return (
    <ul className="flex flex-col gap-2">
      {copies.map((c) => {
        const v = c[metric];
        const counted = c.scope[metric] === 'lifetime';
        const share = counted && v !== null && total.value ? Math.round((v / total.value) * 100) : null;
        return (
          <li key={c.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1.5 text-xs min-w-0" style={{ color: C.muted }}>
                <PlatformChip platform={c.platform} />
                {!counted && v !== null && <span>not included</span>}
                {detail && share !== null && <span>{share}% of the total</span>}
                {detail && <span>{c.read_at ? `read ${shortDate(c.read_at)}` : 'not read yet'}</span>}
                {detail && isStale(item, c) && <SampleChip>Stale reading</SampleChip>}
              </span>
              <span
                className="tabular-nums"
                style={{ color: v === null ? C.muted : C.text, fontWeight: v === null ? 500 : 600, fontSize: v === null ? '0.875rem' : '1rem', flexShrink: 0 }}
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
