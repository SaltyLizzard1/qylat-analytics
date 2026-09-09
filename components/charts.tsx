import { C, CARD, compact } from '@/lib/theme';

/**
 * Monochrome chart primitives, all server rendered.
 *
 * The project is black and white only, so identity is carried by the label and
 * magnitude by bar length. There is no categorical color encoding and therefore
 * no palette to validate. Every chart plots a single measure on a single axis:
 * two measures of different scale are shown as two separate charts, never a
 * second y axis.
 */

export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg px-4 py-3.5" style={CARD}>
      <p className="text-xs uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>
        {label}
      </p>
      <p className="text-2xl tabular-nums" style={{ fontWeight: 600, color: C.text }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
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
};

/**
 * Horizontal bars for magnitude across categories. Bars are anchored to a
 * shared baseline and scaled against the largest value, so lengths are
 * comparable down the column. Only the value is labelled, never every tick.
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
      <div
        className="flex items-baseline justify-between mb-2 pb-1.5"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>
          {valueLabel}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {data.map((d) => (
          <div key={d.key} title={d.title ?? `${d.label}: ${d.value.toLocaleString()}`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-sm truncate" style={{ color: C.text }}>
                {d.label}
              </span>
              <span className="flex items-baseline gap-2 flex-shrink-0">
                {d.meta && (
                  <span className="text-xs" style={{ color: C.muted }}>
                    {d.meta}
                  </span>
                )}
                <span className="text-sm tabular-nums" style={{ fontWeight: 600, color: C.text }}>
                  {compact(d.value)}
                </span>
              </span>
            </div>
            <div
              className="h-2 w-full rounded-full overflow-hidden"
              style={{ background: C.neutral }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`,
                  background: C.text,
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
 * Single series over time. One measure, one axis. Grid and axis are recessive,
 * and only the first, last and peak points carry a label.
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
  const padL = 8;
  const padR = 8;
  const padT = 22;
  const padB = 26;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padT + innerH} L ${x(0).toFixed(1)} ${padT + innerH} Z`;

  const peakIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const labelled = new Set([0, points.length - 1, peakIndex]);

  return (
    <div>
      <div
        className="flex items-baseline justify-between mb-2 pb-1.5"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: C.muted }}>
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
          aria-label={`${valueLabel} across ${points.length} weeks`}
        >
          {/* Recessive baseline and midline */}
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke={C.border} strokeWidth="1" />
          <line
            x1={padL}
            y1={padT + innerH / 2}
            x2={W - padR}
            y2={padT + innerH / 2}
            stroke={C.neutral}
            strokeWidth="1"
          />

          <path d={area} fill={C.neutral} />
          <path d={line} fill="none" stroke={C.text} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) => (
            <g key={p.label}>
              {/* Surface ring keeps the marker readable where the line doubles back. */}
              <circle cx={x(i)} cy={y(p.value)} r="4.5" fill={C.page} stroke={C.text} strokeWidth="2" />
              <circle cx={x(i)} cy={y(p.value)} r="10" fill="transparent">
                <title>{`${p.label}: ${p.value.toLocaleString()}`}</title>
              </circle>
              {labelled.has(i) && (
                <text
                  x={x(i)}
                  y={y(p.value) - 10}
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

export function Empty({ message }: { message: string }) {
  return (
    <div
      className="text-center py-10 rounded-lg text-sm"
      style={{ background: C.neutral, border: `1px dashed ${C.border}`, color: C.muted }}
    >
      {message}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg p-5" style={CARD}>
      <h2 className="text-base mb-1" style={{ fontWeight: 600, color: C.text }}>
        {title}
      </h2>
      {description && (
        <p className="text-xs mb-4 leading-relaxed" style={{ color: C.muted }}>
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs px-3 py-2 rounded mt-4 leading-relaxed"
      style={{ background: C.neutral, color: C.muted }}
    >
      {children}
    </p>
  );
}
