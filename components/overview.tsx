import Link from 'next/link';
import { Delta } from '@/components/Delta';
import { InfoTip } from '@/components/InfoTip';
import { THRESHOLDS } from '@/lib/status';
import {
  C,
  CARD,
  EYEBROW,
  RADIUS,
  SERIES,
  TITLE,
  compact,
  full,
  markerFill,
  platformColor,
  platformLabel,
  previousBar,
  tint,
} from '@/lib/theme';

/**
 * Pieces of the Overview and the pages that share its look: metric cards,
 * comparison bars, clickable charts and the post identity marks.
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
      className="text-xs px-2 py-0.5 whitespace-nowrap"
      style={{ background: C.neutral, color: C.muted, borderRadius: RADIUS.pill, fontWeight: 600 }}
    >
      {children}
    </span>
  );
}

/**
 * Which account, as a chip: a wash of the account's identity colour, a solid
 * dot of it, and the account's name in ink. The name is always there, so the
 * colour is never the only thing saying which account this is.
 */
export function PlatformChip({ platform, children }: { platform: string; children?: React.ReactNode }) {
  const color = platformColor(platform);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 whitespace-nowrap"
      style={{ background: tint(color), color: C.text, borderRadius: RADIUS.pill, fontWeight: 600 }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: color, flexShrink: 0 }} />
      {children ?? platformLabel(platform)}
    </span>
  );
}

/** A quiet chip for a fact that has no colour of its own, such as a format. */
export function QuietChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-2 py-0.5 whitespace-nowrap"
      style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 500 }}
    >
      {children}
    </span>
  );
}

/**
 * Two bars on one scale: this window and the one before. Length is the
 * figure, and each bar carries its own number and name, so the pair reads
 * without colour. Both bars wear the series colour: the current one solid,
 * the earlier one a tint of it inside an outline of the same colour. Lighter
 * means earlier, not worse, and a shorter bar is not a verdict.
 */
export function CompareBars({
  current,
  previous,
  currentLabel = 'Now',
  previousLabel = 'Before',
  color = SERIES.general,
  format = full,
}: {
  current: number;
  previous: number;
  currentLabel?: string;
  previousLabel?: string;
  color?: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(current, previous, 0);
  const width = (v: number) => (max <= 0 ? 0 : Math.max((v / max) * 100, v > 0 ? 3 : 0));
  const rows = [
    { key: 'now', label: currentLabel, value: current, style: { background: color }, strong: true },
    { key: 'before', label: previousLabel, value: previous, style: previousBar(color), strong: false },
  ];
  return (
    <div
      className="grid items-center gap-x-2 gap-y-1"
      style={{ gridTemplateColumns: 'auto 1fr auto' }}
      role="img"
      aria-label={`${currentLabel} ${format(current)}, ${previousLabel.toLowerCase()} ${format(previous)}`}
    >
      {rows.map((r) => (
        <div key={r.key} className="contents">
          <span className="text-xs" style={{ color: r.strong ? C.text : C.muted, fontWeight: r.strong ? 600 : 400 }}>
            {r.label}
          </span>
          <span style={{ height: 12 }}>
            <span
              style={{ display: 'block', height: '100%', width: `${width(r.value)}%`, borderRadius: RADIUS.pill, ...r.style }}
            />
          </span>
          <span
            className="text-xs tabular-nums"
            style={{ color: r.strong ? C.text : C.muted, fontWeight: r.strong ? 700 : 500, textAlign: 'right' }}
          >
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * This window against the one before: the two bars, then the change in words.
 *
 * Both counts are always shown. The percentage appears only when the earlier
 * count is large enough for a percentage to mean something. Two clicks against
 * five is a 60% fall and is also three clicks. "Large enough" is a provisional
 * sample-size rule, not a validated benchmark. The change is stated in ink,
 * not in a status colour: fewer is not the same as worse.
 */
export function Change({
  current,
  previous,
  against,
  color,
}: {
  current: number;
  previous: number;
  against: string;
  color?: string;
}) {
  const enough = previous >= THRESHOLDS.minSampleUrgent;
  return (
    <div className="flex flex-col gap-1.5" title={`${full(previous)} in ${against}`}>
      <CompareBars current={current} previous={previous} currentLabel="This window" previousLabel="Before" color={color} />
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: C.muted }}>
        <span className="tabular-nums">was {full(previous)}</span>
        {enough ? <Delta current={current} previous={previous} suffix="" tone="neutral" /> : <SampleChip>small sample</SampleChip>}
      </span>
    </div>
  );
}

/**
 * One headline figure, large enough to read from across the room. With `href`
 * the whole card is the link to what is behind the number. With `accent` the
 * card carries a band of an account's identity colour, and the label names the
 * account too.
 */
export function MetricCard({
  label,
  value,
  info,
  href,
  accent,
  children,
}: {
  label: string;
  value: string;
  info?: string;
  href?: string;
  /** An identity colour. Says which account, never how it is doing. */
  accent?: string;
  /** Lines under the figure: the period, the breakdown, the change. */
  children?: React.ReactNode;
}) {
  // The figure is the link, stretched over the whole card, so the card is one
  // large target. The "i" sits above that link and is its own control: a
  // button inside a link would be invalid and would follow the link when
  // pressed.
  const words = value.length > 9;
  return (
    <div className={`relative px-4 pt-3.5 overflow-hidden ${href ? 'lift pb-9' : 'pb-4'}`} style={CARD}>
      {accent && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: accent }} />}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p style={EYEBROW}>{label}</p>
        {info && <InfoTip text={info} about={label.toLowerCase()} />}
      </div>
      <p
        className="tabular-nums"
        style={{ ...TITLE, fontSize: words ? '1.5rem' : 'clamp(1.9rem, 5.2vw, 2.6rem)', lineHeight: 1.05 }}
      >
        {href ? (
          <Link
            href={href}
            aria-label={`${label}: ${value}. Open the details`}
            className="after:absolute after:inset-0 after:content-['']"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {value}
          </Link>
        ) : (
          value
        )}
      </p>
      {children && <div className="mt-2.5 flex flex-col gap-1.5">{children}</div>}
      {href && (
        <span aria-hidden className="text-xs" style={{ position: 'absolute', right: 14, bottom: 12, color: C.muted, fontWeight: 600 }}>
          Details →
        </span>
      )}
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
 * carries its own figure, since there are only ever a handful. A bar that is a
 * link lights its whole column under the pointer or the keyboard.
 */
export function ColumnChart({
  columns,
  max,
  color = SERIES.general,
  ariaLabel,
  emptyMessage,
}: {
  columns: Column[];
  max: number;
  color?: string;
  ariaLabel: string;
  emptyMessage: string;
}) {
  if (columns.length === 0) return <ChartEmpty>{emptyMessage}</ChartEmpty>;

  const W = 320;
  const H = 168;
  const padT = 22;
  const padB = 24;
  const innerH = H - padT - padB;
  const slot = W / columns.length;
  const barW = Math.min(slot * 0.68, 54);
  const scale = Math.max(max, 1);
  // With many bars the date labels would collide, so only the ends are named.
  const labelEvery = columns.length <= 6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 560, margin: '0 auto' }} role="img" aria-label={ariaLabel}>
      <line x1={0} y1={padT + innerH} x2={W} y2={padT + innerH} stroke={C.border} strokeWidth="1.5" />
      {columns.map((c, i) => {
        const cx = slot * i + slot / 2;
        const h = c.value === null ? 0 : Math.max((c.value / scale) * innerH, c.value > 0 ? 3 : 0);
        const top = padT + innerH - h;
        const mark = (
          <g>
            {/* The whole column is the target, so a short bar is as easy to hit as a tall one. */}
            <rect className="hit" x={slot * i + 2} y={2} width={slot - 4} height={H - 4} rx={8} fill="transparent">
              <title>{c.title}</title>
            </rect>
            {c.value !== null && (
              <path
                className="bar"
                d={roundedTop(cx - barW / 2, top, barW, h, Math.min(6, h))}
                fill={color}
              />
            )}
            <text
              x={cx}
              y={(c.value === null ? padT + innerH : top) - 6}
              textAnchor="middle"
              fontSize={c.value === null ? '10' : '12.5'}
              fontWeight={c.value === null ? '500' : '700'}
              fill={c.value === null ? C.muted : C.text}
            >
              {c.value === null ? (c.nullLabel ?? 'no figure') : compact(c.value)}
            </text>
            {(labelEvery || i === 0 || i === columns.length - 1) && (
              <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill={C.muted}>
                {c.label}
              </text>
            )}
          </g>
        );
        return c.href ? (
          <a key={c.key} href={c.href} aria-label={c.title} className="mark" style={{ cursor: 'pointer' }}>
            {mark}
          </a>
        ) : (
          <g key={c.key}>{mark}</g>
        );
      })}
    </svg>
  );
}

/** A bar with a rounded top and a square foot, so it sits on the axis. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
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
      {swatch && <span aria-hidden style={{ width: 12, height: 12, borderRadius: 4, background: swatch, flexShrink: 0 }} />}
      <span className="truncate" style={{ fontWeight: 700, color: C.text, fontSize: '1rem', letterSpacing: '-0.012em' }}>
        {title}
      </span>
    </span>
  );
  return (
    <section className="p-4 pb-3" style={CARD}>
      <div className="flex items-center justify-between gap-2 mb-0.5">
        {href ? (
          <Link href={href} className="min-w-0" style={{ textDecoration: 'none' }} title="Open the details">
            <span className="flex items-center gap-2 min-w-0">
              {heading}
              <span
                aria-hidden
                className="text-xs px-1.5"
                style={{ color: C.text, background: C.neutral, borderRadius: RADIUS.pill, fontWeight: 700, lineHeight: '1.25rem' }}
              >
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
      className="inline-flex items-center gap-1.5 text-sm px-3.5 py-1.5"
      style={{
        borderRadius: RADIUS.pill,
        color: C.text,
        background: C.card,
        boxShadow: CARD.boxShadow,
        textDecoration: 'none',
        fontWeight: 700,
      }}
    >
      <span aria-hidden>←</span> {children}
    </Link>
  );
}

/** One surface for a page's filters, so the controls inside it need none of their own. */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 flex flex-col gap-2.5" style={CARD}>
      {children}
    </div>
  );
}

export type MiniPoint = { label: string; value: number; href?: string };

/**
 * A single series over time at card size. Same rules as TrendChart: one
 * measure, one axis, and only the first, last and peak points carry a figure.
 * The axis starts at the lowest value shown, since follower totals move by a
 * handful on a base of hundreds and a zero baseline would draw a flat line.
 * The first and last figures are printed, so the scale is never hidden.
 *
 * The area under the line is filled only when the axis starts at zero. Filled
 * above a cut axis, it would make a small rise look like a large one.
 */
export function MiniTrend({
  points,
  color = SERIES.general,
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
  const H = 168;
  const padX = 16;
  const padT = 26;
  const padB = 24;
  const innerW = W - padX * 2;
  const innerH = H - padT - padB;
  const values = points.map((p) => p.value);
  const lo = zeroBase ? 0 : Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 1);
  const x = (i: number) => padX + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - lo) / span) * innerH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padT + innerH} L ${x(0).toFixed(1)} ${padT + innerH} Z`;
  const peak = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const last = points.length - 1;
  const labelled = new Set([0, last, peak]);
  const dense = points.length > 16;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: 560, margin: '0 auto' }} role="img" aria-label={ariaLabel}>
      <line x1={0} y1={padT + innerH} x2={W} y2={padT + innerH} stroke={C.border} strokeWidth="1.5" />
      {zeroBase && <path d={area} fill={tint(color, 0.2)} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const title = `${p.label}: ${p.value.toLocaleString()}`;
        const dot = (
          <g>
            {(!dense || labelled.has(i)) && (
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={i === last ? 5 : 3.5}
                fill={markerFill(color)}
                stroke={color}
                strokeWidth={i === last ? 3 : 2}
              />
            )}
            <circle className="hit" cx={x(i)} cy={y(p.value)} r={dense ? 6 : 12} fill="transparent">
              <title>{p.href ? `${title}. Click for details` : title}</title>
            </circle>
            {labelled.has(i) && (
              <text
                x={x(i)}
                y={y(p.value) - 10}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                fontSize="12.5"
                fontWeight="700"
                fill={C.text}
              >
                {p.value.toLocaleString()}
              </text>
            )}
          </g>
        );
        return p.href ? (
          <a key={`${p.label}-${i}`} href={p.href} aria-label={title} className="mark" style={{ cursor: 'pointer' }}>
            {dot}
          </a>
        ) : (
          <g key={`${p.label}-${i}`}>{dot}</g>
        );
      })}
      <text x={padX} y={H - 7} fontSize="11" fill={C.muted}>
        {points[0].label}
      </text>
      <text x={W - padX} y={H - 7} fontSize="11" fill={C.muted} textAnchor="end">
        {points[points.length - 1].label}
      </text>
    </svg>
  );
}

/** What a chart shows when there is not enough history to draw one honestly. */
export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs px-4 py-7 text-center leading-relaxed"
      style={{ background: C.neutral, borderRadius: RADIUS.md, color: C.muted }}
    >
      {children}
    </div>
  );
}

/**
 * What stands in for a post image that cannot be shown: the day it was
 * published, under a strip of the account's colour. A date is the next most
 * recognisable thing about a post after its picture, and unlike a grey block
 * it is different on every row. Rendered on the server, so the date is in the
 * dashboard's timezone and identical before and after hydration.
 */
export function DateTile({
  day,
  month,
  color,
  title,
  size = 48,
}: {
  /** "23" */
  day: string;
  /** "Sept" */
  month: string;
  color: string;
  /** Hover text, saying why there is no image. */
  title: string;
  size?: number;
}) {
  return (
    <div
      title={title}
      role="img"
      aria-label={title}
      className="flex flex-col items-center justify-center"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: RADIUS.md,
        borderTop: `${Math.max(4, Math.round(size / 10))}px solid ${color}`,
        background: tint(color, 0.12),
        lineHeight: 1,
        overflow: 'hidden',
      }}
    >
      <span className="tabular-nums" style={{ fontSize: `${Math.max(1, size / 44)}rem`, fontWeight: 800, color: C.text }}>
        {day}
      </span>
      <span
        className="uppercase"
        style={{ fontSize: `${Math.max(0.62, size / 96)}rem`, letterSpacing: '0.06em', color: C.muted, marginTop: 3, fontWeight: 600 }}
      >
        {month}
      </span>
    </div>
  );
}

/**
 * A figure with a bar of its length beside the other rows in the same list.
 * The bar is the comparison, the number is the fact, and the label says what
 * it is. A missing figure says so and draws no bar: it is never a zero.
 */
export function FigureBar({
  label,
  value,
  max,
  color,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  max: number;
  color: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span style={{ ...EYEBROW, fontSize: '0.68rem' }}>{label}</span>
        <span
          className="tabular-nums"
          style={{
            color: value === null ? C.muted : C.text,
            fontWeight: value === null ? 500 : 800,
            fontSize: value === null ? '0.8rem' : emphasis ? '1.35rem' : '1.05rem',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}
        >
          {value === null ? 'No figure' : full(value)}
        </span>
      </div>
      <div style={{ height: emphasis ? 8 : 6, marginTop: 4 }}>
        {value !== null && (
          <div
            style={{
              height: '100%',
              width: `${max <= 0 ? 0 : Math.max((value / max) * 100, value > 0 ? 2 : 0)}%`,
              background: color,
              borderRadius: RADIUS.pill,
            }}
          />
        )}
      </div>
    </div>
  );
}
