import { C, CARD, RADIUS, TITLE, compact } from '@/lib/theme';
import { StatusBadge } from '@/components/status';
import type { Status } from '@/lib/status';

/**
 * Monochrome chart primitives, all server rendered.
 *
 * The base design is black and white: identity comes from labels and magnitude
 * from bar length, so there is no categorical colour encoding and no palette to
 * validate. Colour appears only as status, only through lib/severity.ts, and
 * always beside a text label.
 *
 * Every chart plots a single measure on a single axis. Two measures of
 * different scale become two charts, never a second y axis.
 */

export function StatTile({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: Status | null;
}) {
  return (
    <div className="px-4 py-3.5" style={CARD}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p
          className="text-xs uppercase"
          style={{ color: C.muted, letterSpacing: '0.08em' }}
        >
          {label}
        </p>
        {status !== undefined && <StatusBadge status={status} compact />}
      </div>
      <p
        className="tabular-nums"
        style={{ ...TITLE, fontSize: '1.75rem', lineHeight: 1.1 }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1.5" style={{ color: C.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  /** Right hand annotation, e.g. "23 posts". */
  meta?: string;
  /** Native tooltip text. */
  title?: string;
  /** Optional status, rendered as a badge beside the label. */
  status?: Status | null;
};

/**
 * Horizontal bars for magnitude across categories, scaled to the largest
 * value so lengths compare down the column.
 *
 * There is no track behind the bar. An unfilled rail encodes nothing while
 * looking like it encodes something, and reads as a second series.
 */
export function BarList({
  data,
  valueLabel,
  emptyMessage = 'No data yet.',
}: {
  data: BarDatum[];
  valueLabel: string;
  emptyMessage?: string;
}) {
  if (data.length === 0) return <Empty message={emptyMessage} />;

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      <p
        className="text-xs uppercase pb-2 mb-3"
        style={{ color: C.muted, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}
      >
        {valueLabel}
      </p>

      <div className="flex flex-col gap-3.5">
        {data.map((d) => (
          <div key={d.key} title={d.title ?? `${d.label}: ${d.value.toLocaleString()}`}>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate" style={{ color: C.text }}>
                  {d.label}
                </span>
                {d.status !== undefined && <StatusBadge status={d.status} compact />}
              </span>
              <span className="flex items-baseline gap-2 flex-shrink-0">
                {d.meta && (
                  <span className="text-xs" style={{ color: C.muted }}>
                    {d.meta}
                  </span>
                )}
                <span
                  className="text-sm tabular-nums"
                  style={{ fontWeight: 600, color: C.text }}
                >
                  {compact(d.value)}
                </span>
              </span>
            </div>
            <div style={{ height: 6 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`,
                  background: C.text,
                  borderRadius: RADIUS.pill,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export type TrendPoint = { label: string; value: number };

/**
 * Single series over time. One measure, one axis. Grid and axis recede, and
 * only the first, last and peak points carry a label so the line stays legible.
 */
export function TrendChart({
  points,
  valueLabel,
  emptyMessage = 'Not enough history yet.',
}: {
  points: TrendPoint[];
  valueLabel: string;
  emptyMessage?: string;
}) {
  if (points.length < 2) return <Empty message={emptyMessage} />;

  const W = 720;
  const H = 190;
  const padL = 10;
  const padR = 10;
  const padT = 24;
  const padB = 26;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padT + innerH} L ${x(0).toFixed(
    1
  )} ${padT + innerH} Z`;

  const peakIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const labelled = new Set([0, points.length - 1, peakIndex]);

  return (
    <div>
      <div
        className="flex items-baseline justify-between pb-2 mb-3"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
          {valueLabel}
        </span>
        <span className="text-xs tabular-nums" style={{ color: C.muted }}>
          peak {compact(points[peakIndex].value)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', minWidth: 420 }}
          role="img"
          aria-label={`${valueLabel} across ${points.length} points`}
        >
          <line
            x1={padL}
            y1={padT + innerH}
            x2={W - padR}
            y2={padT + innerH}
            stroke={C.border}
            strokeWidth="1"
          />
          <line
            x1={padL}
            y1={padT + innerH / 2}
            x2={W - padR}
            y2={padT + innerH / 2}
            stroke={C.neutral}
            strokeWidth="1"
          />

          <path d={area} fill={C.neutral} />
          <path
            d={line}
            fill="none"
            stroke={C.text}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <g key={`${p.label}-${i}`}>
              {/* Surface ring keeps a marker readable where the line doubles back. */}
              <circle cx={x(i)} cy={y(p.value)} r="4" fill={C.page} stroke={C.text} strokeWidth="2" />
              <circle cx={x(i)} cy={y(p.value)} r="11" fill="transparent">
                <title>{`${p.label}: ${p.value.toLocaleString()}`}</title>
              </circle>
              {labelled.has(i) && (
                <text
                  x={x(i)}
                  y={y(p.value) - 11}
                  textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                  fontSize="11"
                  fontWeight="600"
                  fill={C.text}
                >
                  {compact(p.value)}
                </text>
              )}
            </g>
          ))}

          <text x={padL} y={H - 8} fontSize="10" fill={C.muted}>
            {points[0].label}
          </text>
          <text x={W - padR} y={H - 8} fontSize="10" fill={C.muted} textAnchor="end">
            {points[points.length - 1].label}
          </text>
        </svg>
      </div>
    </div>
  );
}

/**
 * Two series over the same x axis, drawn as stacked small multiples.
 *
 * Deliberately not one chart with two y axes. Aligning the axes lets the eye
 * compare the shapes without the chart asserting that the two measures share a
 * scale, which is the single most common way a chart lies.
 */
export function PairedTrend({
  top,
  bottom,
}: {
  top: { points: TrendPoint[]; label: string };
  bottom: { points: TrendPoint[]; label: string };
}) {
  return (
    <div className="space-y-5">
      <TrendChart points={top.points} valueLabel={top.label} />
      <TrendChart points={bottom.points} valueLabel={bottom.label} />
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <div
      className="text-center py-10 text-sm"
      style={{
        background: C.neutral,
        border: `1px dashed ${C.border}`,
        borderRadius: RADIUS.md,
        color: C.muted,
      }}
    >
      {message}
    </div>
  );
}

export function Panel({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description?: string;
  status?: Status | null;
  children: React.ReactNode;
}) {
  return (
    <section className="p-5" style={CARD}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-base" style={{ fontWeight: 600, color: C.text, letterSpacing: '-0.011em' }}>
          {title}
        </h2>
        {status !== undefined && <StatusBadge status={status} />}
      </div>
      {description && (
        <p className="text-xs leading-relaxed mb-4" style={{ color: C.muted, maxWidth: '60ch' }}>
          {description}
        </p>
      )}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs px-3 py-2.5 mt-4 leading-relaxed"
      style={{
        background: C.neutral,
        color: C.muted,
        borderRadius: RADIUS.sm,
        borderLeft: `2px solid ${C.border}`,
      }}
    >
      {children}
    </p>
  );
}

/** Page header, so every view opens the same way. */
export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div>
      <h1 className="mb-1" style={{ ...TITLE, fontSize: '1.6rem' }}>
        {title}
      </h1>
      {lead && (
        <p className="text-sm leading-relaxed" style={{ color: C.muted, maxWidth: '70ch' }}>
          {lead}
        </p>
      )}
    </div>
  );
}
