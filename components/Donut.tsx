import { C, RADIUS, compact } from '@/lib/theme';
import { Empty } from '@/components/charts';

/**
 * Part to whole, for a small number of slices.
 *
 * A donut is only defensible when the question is genuinely "what share of the
 * whole", and with few enough slices that arcs stay comparable. Beyond about
 * five it becomes unreadable and a bar list is better, so this caps at five
 * and folds the rest into "Other" rather than shrinking every arc.
 *
 * Two colour modes:
 *   `colors` supplied  -> identity hues, e.g. platform brand colours.
 *   nothing supplied   -> a grey ramp, dark to light, ordered by size. That is
 *                         a sequential scale on one hue, which is the correct
 *                         form when the slices have no identity colour of
 *                         their own. It keeps invented hues out of the design.
 *
 * Every slice is directly labelled in the legend with its value and share, so
 * nothing depends on telling two arcs apart by colour.
 */

export type Slice = { key: string; label: string; value: number; color?: string };

const GREY_RAMP = ['#111111', '#454545', '#6E6E6E', '#9A9A9A', '#C4C4C4'];
const MAX_SLICES = 5;

export function Donut({
  data,
  total: totalOverride,
  valueLabel,
  emptyMessage = 'No data yet.',
  size = 168,
  centreLabel,
}: {
  data: Slice[];
  total?: number;
  valueLabel: string;
  emptyMessage?: string;
  size?: number;
  /** Small caption under the centre total, e.g. "posts". */
  centreLabel?: string;
}) {
  const positive = data.filter((d) => d.value > 0);
  if (positive.length === 0) return <Empty message={emptyMessage} />;

  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const slices: Slice[] =
    tail.length > 0
      ? [...head, { key: '__other', label: 'Other', value: tail.reduce((n, s) => n + s.value, 0) }]
      : head;

  const total = totalOverride ?? slices.reduce((n, s) => n + s.value, 0);
  if (total <= 0) return <Empty message={emptyMessage} />;

  const stroke = 26;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // 2px of surface between arcs, per the mark spec. Without it neighbouring
  // slices merge into one shape.
  const gap = 2;

  let offset = 0;

  return (
    <div>
      <p
        className="text-xs uppercase pb-2 mb-3"
        style={{ color: C.muted, letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}` }}
      >
        {valueLabel}
      </p>

      <div className="flex items-center gap-5 flex-wrap">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ flexShrink: 0 }}
          role="img"
          aria-label={`${valueLabel}: ${slices
            .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
            .join(', ')}`}
        >
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((s, i) => {
              const share = s.value / total;
              const arc = Math.max(share * circumference - gap, 1);
              const dash = `${arc} ${circumference - arc}`;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={s.color ?? GREY_RAMP[i % GREY_RAMP.length]}
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += share * circumference;
              return el;
            })}
          </g>
          <text
            x={size / 2}
            y={size / 2 + (centreLabel ? -2 : 6)}
            textAnchor="middle"
            fontSize="26"
            fontWeight="600"
            fill={C.text}
          >
            {compact(total)}
          </text>
          {centreLabel && (
            <text
              x={size / 2}
              y={size / 2 + 16}
              textAnchor="middle"
              fontSize="10"
              fill={C.muted}
              style={{ letterSpacing: '0.08em' }}
            >
              {centreLabel.toUpperCase()}
            </text>
          )}
        </svg>

        <ul className="flex flex-col gap-1.5 min-w-0 flex-1">
          {slices.map((s, i) => (
            <li key={s.key} className="flex items-center justify-between gap-3 text-sm py-0.5">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: RADIUS.sm,
                    background: s.color ?? GREY_RAMP[i % GREY_RAMP.length],
                    flexShrink: 0,
                  }}
                />
                <span className="truncate" style={{ color: C.text }}>
                  {s.label}
                </span>
              </span>
              <span className="flex items-baseline gap-2 flex-shrink-0 tabular-nums">
                <span className="text-xs" style={{ color: C.muted }}>
                  {compact(s.value)}
                </span>
                <span style={{ fontWeight: 600, color: C.text }}>
                  {((s.value / total) * 100).toFixed(0)}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
