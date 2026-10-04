import Link from 'next/link';
import { Delta } from '@/components/Delta';
import { InfoTip } from '@/components/InfoTip';
import { THRESHOLDS } from '@/lib/status';
import { C, CARD, RADIUS, TITLE, compact, full } from '@/lib/theme';

/**
 * Pieces of the Overview: compact metric cards and clickable column charts.
 *
 * Everything here that can be clicked is a real link, so it opens in a new
 * tab, shows its destination on hover and works without JavaScript.
 */

/**
 * Says a figure rests on few posts or events. A fact about the evidence, not
 * a status, so it has no colour. The cut-offs behind it are provisional
 * sample-size rules in lib/status.ts, not validated benchmarks.
 */
export function SampleChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 whitespace-nowrap"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.sm }}
    >
      {children}
    </span>
  );
}

/**
 * This window against the one before, numbers first.
 *
 * "12, was 9" is always shown. The percentage and its colour appear only when
 * the earlier count is large enough for a percentage to mean something. Two
 * clicks against five is a 60% fall and is also three clicks. "Large enough"
 * is a provisional sample-size rule, not a validated benchmark.
 */
export function Change({ current, previous, against }: { current: number; previous: number; against: string }) {
  const enough = previous >= THRESHOLDS.minSampleUrgent;
  return (
    <span className="text-xs" style={{ color: C.muted }}>
      <span className="tabular-nums" title={`${full(previous)} in ${against}`}>
        was {full(previous)}
      </span>{' '}
      {enough ? (
        <Delta current={current} previous={previous} suffix="" />
      ) : (
        <SampleChip>small sample</SampleChip>
      )}
    </span>
  );
}

/**
 * One headline figure. Compact on purpose: the charts are the page, and these
 * are the five second answer above them. With `href` the whole card is the
 * link to what is behind the number.
 */
export function MetricCard({
  label,
  value,
  info,
  href,
  children,
}: {
  label: string;
  value: string;
  info?: string;
  href?: string;
  /** Lines under the figure: the period, the breakdown, the change. */
  children?: React.ReactNode;
}) {
  // The figure is the link, stretched over the whole card, so the card is one
  // large target. The "i" sits above that link and is its own control: a
  // button inside a link would be invalid and would follow the link when
  // pressed.
  return (
    <div className="relative px-3.5 py-3" style={CARD}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
          {label}
        </p>
        {info && <InfoTip text={info} about={label.toLowerCase()} />}
      </div>
      <p className="tabular-nums" style={{ ...TITLE, fontSize: '1.5rem', lineHeight: 1.15 }}>
        {href ? (
          <Link
            href={href}
            aria-label={`${label}: ${value}. Open the details`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-[#111111]"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </p>
      {children && <div className="mt-1.5 flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

/** A small line under a card's figure. */
export function CardLine({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs" style={{ color: C.muted }}>
      {children}
    </span>
  );
}

export type Column = {
  key: string;
  /** Under the bar, e.g. "22 Sept". */
  label: string;
  /** Null draws no bar and says so. It is never drawn as an empty, zero height bar. */
  value: number | null;
  /** What to print in place of a figure when value is null. Defaults to "no figure". */
  nullLabel?: string;
  /** Where clicking this bar goes. */
  href?: string;
  /** Hover text. */
  title: string;
};

/**
 * Vertical bars over a short run of periods, each bar a link to what is in it.
 *
 * Magnitude is the bar height, read against `max`, which the caller shares
 * across charts that sit side by side so their heights compare. Every bar
 * carries its own figure, since there are only ever a handful.
 */
export function ColumnChart({
  columns,
  max,
  color = C.text,
  ariaLabel,
  emptyMessage,
}: {
  columns: Column[];
  max: number;
  color?: string;
  ariaLabel: string;
  emptyMessage: string;
}) {
  if (columns.length === 0) {
    return (
      <div
        className="text-center text-xs py-8 px-3"
        style={{ background: C.neutral, border: `1px dashed ${C.border}`, borderRadius: RADIUS.md, color: C.muted }}
      >
        {emptyMessage}
      </div>
    );
  }

  const W = 320;
  const H = 150;
  const padT = 18;
  const padB = 22;
  const innerH = H - padT - padB;
  const slot = W / columns.length;
  const barW = Math.min(slot * 0.62, 46);
  const scale = Math.max(max, 1);
  // With many bars the date labels would collide, so only the ends are named.
  const labelEvery = columns.length <= 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 560, margin: '0 auto' }} role="img" aria-label={ariaLabel}>
      <line x1={0} y1={padT + innerH} x2={W} y2={padT + innerH} stroke={C.border} strokeWidth="1" />
      {columns.map((c, i) => {
        const cx = slot * i + slot / 2;
        const h = c.value === null ? 0 : Math.max((c.value / scale) * innerH, c.value > 0 ? 2 : 0);
        const top = padT + innerH - h;
        const mark = (
          <g>
            {/* The whole column is the target, so a short bar is as easy to hit as a tall one. */}
            <rect x={slot * i} y={0} width={slot} height={H} fill="transparent">
              <title>{c.title}</title>
            </rect>
            {c.value !== null && <rect x={cx - barW / 2} y={top} width={barW} height={h} rx={3} fill={color} />}
            <text
              x={cx}
              y={(c.value === null ? padT + innerH : top) - 5}
              textAnchor="middle"
              fontSize={c.value === null ? '9' : '11'}
              fontWeight={c.value === null ? '400' : '600'}
              fill={c.value === null ? C.muted : C.text}
            >
              {c.value === null ? (c.nullLabel ?? 'no figure') : compact(c.value)}
            </text>
            {(labelEvery || i === 0 || i === columns.length - 1) && (
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill={C.muted}>
                {c.label}
              </text>
            )}
          </g>
        );
        return c.href ? (
          <a key={c.key} href={c.href} aria-label={c.title} style={{ cursor: 'pointer' }}>
            {mark}
          </a>
        ) : (
          <g key={c.key}>{mark}</g>
        );
      })}
    </svg>
  );
}

/**
 * A chart's frame: what it shows, the account it belongs to, and how fresh it
 * is. The title is the link to the detail behind the whole chart.
 */
export function ChartCard({
  title,
  href,
  swatch,
  note,
  info,
  children,
}: {
  title: string;
  href?: string;
  /** Identity colour of the account this chart belongs to. The title names it too. */
  swatch?: string;
  /** Always visible: the reporting period or the age of the data. */
  note?: React.ReactNode;
  info?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <span className="flex items-center gap-2 min-w-0">
      {swatch && (
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: RADIUS.pill, background: swatch, flexShrink: 0 }} />
      )}
      <span className="text-sm truncate" style={{ fontWeight: 600, color: C.text }}>
        {title}
      </span>
    </span>
  );
  return (
    <section className="p-4" style={CARD}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        {href ? (
          <Link href={href} className="min-w-0" style={{ textDecoration: 'none' }} title="Open the details">
            <span className="flex items-center gap-1.5 min-w-0">
              {heading}
              <span aria-hidden style={{ color: C.muted, fontSize: '0.8rem' }}>
                →
              </span>
            </span>
          </Link>
        ) : (
          heading
        )}
        {info && <InfoTip text={info} about={title.toLowerCase()} />}
      </div>
      {note && (
        <p className="text-xs mb-3" style={{ color: C.muted }}>
          {note}
        </p>
      )}
      {children}
    </section>
  );
}

/** The way back from a detail view, with the filters it was opened with. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5"
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.sm,
        color: C.text,
        background: C.card,
        textDecoration: 'none',
        fontWeight: 600,
      }}
    >
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

export type MiniPoint = { label: string; value: number; href?: string };

/**
 * A single series over time at card size. Same rules as TrendChart: one
 * measure, one axis, and only the first, last and peak points carry a figure.
 * The axis starts at the lowest value shown, since follower totals move by a
 * handful on a base of hundreds and a zero baseline would draw a flat line.
 * The first and last figures are printed, so the scale is never hidden.
 */
export function MiniTrend({
  points,
  color = C.text,
  ariaLabel,
  zeroBase = false,
}: {
  points: MiniPoint[];
  color?: string;
  ariaLabel: string;
  /**
   * Start the axis at zero. Right for counts of events, such as sessions per
   * day, where the height above zero is the figure. Wrong for a running total,
   * where it would flatten every movement.
   */
  zeroBase?: boolean;
}) {
  const W = 320;
  const H = 150;
  const padX = 14;
  const padT = 22;
  const padB = 22;
  const innerW = W - padX * 2;
  const innerH = H - padT - padB;
  const values = points.map((p) => p.value);
  const lo = zeroBase ? 0 : Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - lo) / span) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const labelled = new Set([0, points.length - 1, peak]);
  const dense = points.length > 16;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 560, margin: '0 auto' }} role="img" aria-label={ariaLabel}>
      <line x1={0} y1={padT + innerH} x2={W} y2={padT + innerH} stroke={C.border} strokeWidth="1" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const title = `${p.label}: ${p.value.toLocaleString()}`;
        const dot = (
          <g>
            {(!dense || labelled.has(i)) && (
              <circle cx={x(i)} cy={y(p.value)} r="3.5" fill={C.page} stroke={color} strokeWidth="2" />
            )}
            <circle cx={x(i)} cy={y(p.value)} r={dense ? 6 : 12} fill="transparent">
              <title>{p.href ? `${title}. Click for details` : title}</title>
            </circle>
            {labelled.has(i) && (
              <text
                x={x(i)}
                y={y(p.value) - 9}
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                fontSize="11"
                fontWeight="600"
                fill={C.text}
              >
                {p.value.toLocaleString()}
              </text>
            )}
          </g>
        );
        return p.href ? (
          <a key={`${p.label}-${i}`} href={p.href} aria-label={title} style={{ cursor: 'pointer' }}>
            {dot}
          </a>
        ) : (
          <g key={`${p.label}-${i}`}>{dot}</g>
        );
      })}
      <text x={padX} y={H - 6} fontSize="10" fill={C.muted}>
        {points[0].label}
      </text>
      <text x={W - padX} y={H - 6} fontSize="10" fill={C.muted} textAnchor="end">
        {points[points.length - 1].label}
      </text>
    </svg>
  );
}

/** What a chart shows when there is not enough history to draw one honestly. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs px-3 py-6 text-center"
      style={{ background: C.neutral, border: `1px dashed ${C.border}`, borderRadius: RADIUS.md, color: C.muted }}
    >
      {children}
    </div>
  );
}
