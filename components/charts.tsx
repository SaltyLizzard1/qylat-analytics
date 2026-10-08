import Link from 'next/link';
import { C, CARD, EYEBROW, FIGURE, RADIUS, SERIES, TITLE, compact, markerFill, tint } from '@/lib/theme';
import { StatusBadge, StatusLegend } from '@/components/status';
import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import type { Status } from '@/lib/status';

/**
 * Chart primitives and page furniture, all server rendered.
 *
 * Identity comes from labels first and an identity hue second, and magnitude
 * from bar length, never from colour. Status colour comes only through
 * lib/severity.ts and always sits beside a text label.
 *
 * Every chart plots a single measure on a single axis. Two measures of
 * different scale become two charts, never a second y axis.
 */

export function StatTile({
  label,
  value,
  sub,
  status,
  delta,
  size = 'standard',
}: {
  label: string;
  value: string;
  sub?: string;
  status?: Status | null;
  /** Period over period change, rendered under the number. */
  delta?: React.ReactNode;
  /**
   * Which tier of figure this is. `standard` is the default so every existing
   * caller keeps the size it had.
   *
   * `hero` is for the handful of numbers that answer the question the page
   * exists to answer. Twelve tiles at one size is why nothing stood out on the
   * overview: the eye needs somewhere to land before it starts reading, and
   * uniform weight denies it that.
   */
  size?: 'hero' | 'standard';
}) {
  const hero = size === 'hero';
  return (
    <div className={hero ? 'px-4 py-4' : 'px-4 py-3.5'} style={CARD}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p style={EYEBROW}>{label}</p>
        {status !== undefined && <StatusBadge status={status} compact />}
      </div>
      <p className="tabular-nums" style={{ ...TITLE, ...FIGURE[size] }}>
        {value}
      </p>
      {delta && <div className={hero ? 'mt-2' : 'mt-1.5'}>{delta}</div>}
      {sub && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * Band that groups the panels below it.
 *
 * Nine views of equal-weight cards is a long undifferentiated scroll. A rule
 * with a label tells the eye where one idea stops and the next begins, which
 * is cheaper than another layer of nesting.
 */
export function SectionHeading({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="pt-4">
      <h2 style={{ ...TITLE, fontSize: '1.2rem', lineHeight: 1.2 }}>{children}</h2>
      {note && (
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>
          {note}
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
  /**
   * Optional identity colour for the bar, e.g. a platform hue. Says WHICH,
   * never how good. Defaults to the list's own series colour.
   */
  color?: string;
  /** Where clicking this row goes. The whole row becomes the link. */
  href?: string;
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
  max: sharedMax,
  color = SERIES.general,
}: {
  data: BarDatum[];
  valueLabel: string;
  emptyMessage?: string;
  /** The series colour for bars that carry none of their own. Never ink or grey. */
  color?: string;
  /**
   * Scale bars against this instead of the panel's own largest value.
   *
   * Without it, every panel normalises to itself, so a Facebook reel averaging
   * 1 engagement draws exactly the same full width bar as an Instagram reel
   * averaging 14. Two charts meant to be read against each other have to share
   * a scale or the longer bar means nothing.
   */
  max?: number;
}) {
  if (data.length === 0) return <Empty message={emptyMessage} />;

  const max = Math.max(sharedMax ?? 0, ...data.map((d) => d.value), 1);

  return (
    <div>
      <p className="mb-2.5" style={EYEBROW}>
        {valueLabel}
      </p>

      <div className="flex flex-col gap-1">
        {data.map((d) => {
          const row = (
            <>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-sm truncate" style={{ color: C.text, fontWeight: 600 }}>
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
                  className="tabular-nums"
                  style={{ fontWeight: 600, color: C.text, fontSize: '1.1rem', letterSpacing: '-0.02em' }}
                >
                  {compact(d.value)}
                </span>
              </span>
            </div>
            <div style={{ height: 12 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max((d.value / max) * 100, d.value > 0 ? 1.5 : 0)}%`,
                  background: d.color ?? color,
                  borderRadius: RADIUS.pill,
                }}
              />
            </div>
            </>
          );
          const title = d.title ?? `${d.label}: ${d.value.toLocaleString()}`;
          return d.href ? (
            <Link
              key={d.key}
              href={d.href}
              title={title}
              className="block row-link px-2 py-2 -mx-2"
              style={{ textDecoration: 'none', borderRadius: RADIUS.md }}
            >
              {row}
            </Link>
          ) : (
            <div key={d.key} title={title} className="py-2">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type TrendPoint = {
  label: string;
  value: number;
  /** Where clicking this point goes. */
  href?: string;
};

/** A round step for an axis: 1, 2 or 5 times a power of ten. */
function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const unit = rough / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/**
 * Single series over time. One measure, one axis, with its tick values
 * printed. Grid and axis recede, and only the first, last and peak points
 * carry a label so the line stays legible.
 *
 * `baseline="zero"` (the default) starts the axis at zero and fills the area
 * under the line: right for a count per period, where height above zero is the
 * figure.
 *
 * `baseline="fit"` starts the axis just under the lowest value: right for a
 * running total such as followers, where 388 to 403 on a zero axis is a flat
 * line and the change is the point. A fitted axis is never silent about it.
 * The chart says where the axis starts, marks the break on the axis itself,
 * and draws no area, because an area above a cut axis makes a small rise look
 * like a large one. If the fitted axis would reach zero anyway, it is drawn
 * from zero.
 */
export function TrendChart({
  points,
  valueLabel,
  emptyMessage = 'Not enough history yet.',
  color = SERIES.general,
  baseline = 'zero',
}: {
  points: TrendPoint[];
  valueLabel: string;
  emptyMessage?: string;
  /** The series colour: line, area and markers all take it. */
  color?: string;
  baseline?: 'zero' | 'fit';
}) {
  if (points.length < 2) return <Empty message={emptyMessage} />;

  const values = points.map((p) => p.value);
  const hi = Math.max(...values, 1);
  const lo = Math.min(...values);

  let axisMin = 0;
  let step = niceStep(hi / 3);
  if (baseline === 'fit') {
    const fitStep = niceStep(Math.max(hi - lo, 1) / 3);
    const fitMin = Math.floor((lo - fitStep * 0.25) / fitStep) * fitStep;
    if (fitMin > 0) {
      axisMin = fitMin;
      step = fitStep;
    }
  }
  const axisMax = Math.max(Math.ceil(hi / step) * step, axisMin + step);
  const ticks: number[] = [];
  for (let v = axisMin; v <= axisMax + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000);
  const cut = axisMin > 0;

  const peakIndex = points.reduce((best, p, i) => (p.value > points[best].value ? i : best), 0);
  const last = points.length - 1;
  const labelled = new Set([0, last, peakIndex]);
  // Many points: a marker on each would be a caterpillar. Mark the labelled ones.
  const dense = points.length > 16;
  const say = (n: number) => n.toLocaleString('en-GB');
  const summary = `${valueLabel} across ${points.length} points, from ${say(points[0].value)} to ${say(points[last].value)}${
    cut ? `. The axis starts at ${say(axisMin)}, not zero` : ''
  }`;

  /**
   * The same chart drawn for one width. The page renders it twice, wide and
   * narrow, and CSS shows one, so the text is a readable size on a phone
   * instead of a wide drawing scaled down to fit.
   */
  const draw = (W: number, H: number, className: string) => {
    const padL = 44;
    const padR = 16;
    const padT = 28;
    const padB = 30;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const base = padT + innerH;
    const x = (i: number) => padL + (i / last) * innerW;
    const y = (v: number) => base - ((v - axisMin) / (axisMax - axisMin)) * innerH;
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    const area = `${line} L ${x(last).toFixed(1)} ${base} L ${x(0).toFixed(1)} ${base} Z`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className={className} role="img" aria-label={summary}>
        {ticks.map((v, i) => (
          <g key={v}>
            <line
              x1={padL}
              y1={y(v)}
              x2={W - padR}
              y2={y(v)}
              stroke={i === 0 ? C.border : C.neutral}
              strokeWidth={i === 0 ? 1.5 : 1}
            />
            <text x={padL - 8} y={y(v) + 4} fontSize="11.5" fill={C.muted} textAnchor="end">
              {compact(v)}
            </text>
          </g>
        ))}
        {/* A break under the lowest tick, where the missing part down to zero would be. */}
        {cut && (
          <path
            className="axis"
            d={`M ${padL - 20} ${base + 9} l 5 3 l -10 4 l 10 4 l -5 3`}
            fill="none"
            stroke={C.muted}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <title>{`The axis is cut: it starts at ${say(axisMin)}, not zero`}</title>
          </path>
        )}

        {!cut && <path d={area} fill={tint(color, 0.2)} />}
        <path d={line} fill="none" stroke={color} strokeWidth="2.75" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={`${p.label}-${i}`}>
            {(!dense || labelled.has(i)) && (
              <circle cx={x(i)} cy={y(p.value)} r="4.5" fill={markerFill(color)} stroke={color} strokeWidth="2" />
            )}
            {p.href ? (
              <a href={p.href} aria-label={`${p.label}: ${say(p.value)}`} className="mark" style={{ cursor: 'pointer' }}>
                <circle className="hit" cx={x(i)} cy={y(p.value)} r="13" fill="transparent">
                  <title>{`${p.label}: ${say(p.value)}. Click for details`}</title>
                </circle>
              </a>
            ) : (
              <circle cx={x(i)} cy={y(p.value)} r="11" fill="transparent">
                <title>{`${p.label}: ${say(p.value)}`}</title>
              </circle>
            )}
            {labelled.has(i) && (
              <text
                x={x(i)}
                y={y(p.value) - 11}
                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                fontSize="13"
                fontWeight="600"
                fill={C.text}
              >
                {say(p.value)}
              </text>
            )}
          </g>
        ))}

        <text x={padL} y={H - 8} fontSize="11.5" fill={C.muted}>
          {points[0].label}
        </text>
        <text x={W - padR} y={H - 8} fontSize="11.5" fill={C.muted} textAnchor="end">
          {points[last].label}
        </text>
      </svg>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <span style={EYEBROW}>{valueLabel}</span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs tabular-nums" style={{ color: C.muted }}>
          {cut && (
            <span
              className="px-2 py-0.5"
              style={{ background: C.neutral, color: C.text, borderRadius: RADIUS.pill, fontWeight: 600 }}
            >
              Axis starts at {say(axisMin)}, not zero
            </span>
          )}
          <span>peak {say(points[peakIndex].value)}</span>
        </span>
      </div>

      {draw(720, 220, 'hidden sm:block')}
      {draw(350, 230, 'block sm:hidden')}
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
  top: { points: TrendPoint[]; label: string; color?: string };
  bottom: { points: TrendPoint[]; label: string; color?: string };
}) {
  return (
    <div className="space-y-5">
      <TrendChart points={top.points} valueLabel={top.label} color={top.color ?? SERIES.general} />
      <TrendChart points={bottom.points} valueLabel={bottom.label} color={bottom.color ?? SERIES.second} />
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <div
      className="text-center py-10 px-4 text-sm"
      style={{
        background: C.neutral,
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
  detail,
  children,
}: {
  title: string;
  description?: string;
  status?: Status | null;
  /**
   * The long version, folded away. See Disclosure: the caveat stays on the
   * page and stays findable, it just stops being the first thing read.
   */
  detail?: { summary: string; children: React.ReactNode };
  children: React.ReactNode;
}) {
  return (
    <section className="p-5" style={CARD}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 style={{ ...TITLE, fontSize: '1.15rem', lineHeight: 1.25 }}>{title}</h2>
        {status !== undefined && <StatusBadge status={status} />}
      </div>
      {description && (
        <p className="text-xs leading-relaxed mb-4" style={{ color: C.muted, maxWidth: '60ch' }}>
          {description}
        </p>
      )}
      {!description && <div className="mb-4" />}
      {children}
      {detail && (
        <div className="mt-4">
          <Disclosure summary={detail.summary}>{detail.children}</Disclosure>
        </div>
      )}
    </section>
  );
}

/**
 * A caveat that stays on the page without being read every time.
 *
 * This dashboard has expensive lessons written into it: which figure is a
 * lifetime total, which platform returns zero for a metric it accepts, why a
 * number cannot be summed across days. Deleting that text would be the third
 * time the same mistake gets made. Leaving all of it open turned the overview
 * into 1,500 words of prose.
 *
 * Native details and summary, so it is server rendered, needs no JavaScript,
 * is keyboard operable and searchable by the browser's own find.
 *
 * The summary is written as the question it answers, not as "more info". A
 * reader decides whether to open it from the summary alone, which only works
 * if the summary says what is inside.
 */
export function Disclosure({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group">
      <summary
        className="text-xs cursor-pointer inline-flex items-center gap-1.5 select-none px-2.5 py-1"
        style={{ color: C.text, background: C.neutral, borderRadius: RADIUS.pill, fontWeight: 600 }}
      >
        <span
          aria-hidden
          className="transition-transform group-open:rotate-90"
          style={{ display: 'inline-block', fontSize: '0.6rem', lineHeight: 1 }}
        >
          ▶
        </span>
        <span>{summary}</span>
      </summary>
      <div
        className="text-xs leading-relaxed mt-2 px-3 py-2.5"
        style={{
          background: C.card,
          color: C.muted,
          borderRadius: RADIUS.md,
          boxShadow: CARD.boxShadow,
          maxWidth: '72ch',
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-xs px-3 py-2.5 mt-4 leading-relaxed"
      style={{
        background: C.neutral,
        color: C.muted,
        borderRadius: RADIUS.md,
      }}
    >
      {children}
    </p>
  );
}

/** Page header, so every view opens the same way. */
export function PageHeader({
  title,
  lead,
  meta,
}: {
  title: string;
  lead?: string;
  /**
   * Facts about the data rather than a sentence about it.
   *
   * The overview used to open "18 posts from 12 Jun to 25 Sept. Last synced 27
   * Sept, 18:41." Three figures wearing a sentence as a disguise. As separate
   * labelled items the eye takes all three at once instead of reading left to
   * right, which is the whole point of a dashboard.
   */
  meta?: { label: string; value: string }[];
}) {
  return (
    <div>
      <h1
        className={meta?.length || lead ? 'mb-2' : ''}
        style={{ ...TITLE, fontWeight: 600, fontSize: 'clamp(1.75rem, 5vw, 2.25rem)', lineHeight: 1.1 }}
      >
        {title}
      </h1>
      {meta && meta.length > 0 && (
        <dl className="flex flex-wrap items-center gap-1.5">
          {meta.map((m) => (
            <div
              key={m.label}
              className="flex items-baseline gap-1.5 px-2.5 py-1"
              style={{ background: C.card, borderRadius: RADIUS.pill, boxShadow: '0 1px 2px rgba(19, 21, 43, 0.06)' }}
            >
              <dt className="text-xs" style={{ color: C.muted }}>
                {m.label}
              </dt>
              <dd className="text-xs tabular-nums" style={{ color: C.text, fontWeight: 600 }}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {lead && (
        <p className="text-sm leading-relaxed mt-2" style={{ color: C.muted, maxWidth: '70ch' }}>
          {lead}
        </p>
      )}
    </div>
  );
}

/**
 * The glance answer, and the reason this page exists.
 *
 * Before this, the most important fact on the overview ("2 urgent, 3 to watch")
 * rendered at 1rem inside a card, the same size as the heading "Known blind
 * spots". You had to read the page to find out whether anything was wrong.
 * Now the count is the largest thing on the screen and it is the first thing
 * the eye lands on.
 *
 * Colour is the status colour and nothing else, carried on a dot beside a word
 * that says the same thing, so it survives greyscale and colour blindness. The
 * card itself stays white: an earlier version of the overview took the worst
 * item's severity colour as a full card background and turned the top of the
 * dashboard into one large red block, which made a background the loudest
 * thing on the page.
 */
export function Verdict({
  urgent,
  watch,
  children,
}: {
  urgent: number;
  watch: number;
  children?: React.ReactNode;
}) {
  const clear = urgent === 0 && watch === 0;

  const counts: { n: number; word: string; color: string }[] = [
    { n: urgent, word: urgent === 1 ? 'needs work now' : 'need work now', color: severityBad.color },
    { n: watch, word: 'to watch', color: severityWarning.color },
  ].filter((c) => c.n > 0);

  return (
    <section className="px-5 py-4" style={CARD}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <p className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
          Where you stand
        </p>
        <StatusLegend />
      </div>

      {clear ? (
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{ width: 12, height: 12, borderRadius: 999, background: severityGood.color, flexShrink: 0 }}
          />
          <p style={{ ...TITLE, ...FIGURE.standard }}>All clear</p>
        </div>
      ) : (
        <div className="flex items-end flex-wrap gap-x-8 gap-y-3">
          {counts.map((c) => (
            <div key={c.word} className="flex items-end gap-2.5">
              <span
                aria-hidden
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  background: c.color,
                  flexShrink: 0,
                  marginBottom: '0.6rem',
                }}
              />
              <p className="tabular-nums" style={{ ...TITLE, ...FIGURE.hero }}>
                {c.n}
              </p>
              <p className="text-sm" style={{ color: C.muted, marginBottom: '0.45rem' }}>
                {c.word}
              </p>
            </div>
          ))}
        </div>
      )}

      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
