import { severityGood, severityWarning, severityBad } from '@/lib/severity';
import type { Level, Status } from '@/lib/status';
import { C } from '@/lib/theme';

/**
 * Status colour lives here and in lib/severity.ts, nowhere else.
 *
 * The label is not optional. Red and green are indistinguishable to a
 * meaningful share of readers, and a greyscale print of this page still has to
 * be readable, so the colour is always a reinforcement of text rather than the
 * only carrier of meaning.
 */

const STYLE: Record<Level, { color: string; background: string; border: string }> = {
  good: severityGood,
  warning: severityWarning,
  bad: severityBad,
};

/** Filled dot plus label. The default way to show a status. */
export function StatusBadge({
  status,
  compact = false,
}: {
  status: Status | null;
  compact?: boolean;
}) {
  if (!status) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full text-xs whitespace-nowrap"
        style={{
          padding: compact ? '0.1rem 0.45rem' : '0.2rem 0.6rem',
          background: C.neutral,
          color: C.muted,
          border: `1px solid ${C.border}`,
        }}
        title="Not enough data to judge this yet"
      >
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: 999, background: C.border }}
        />
        {compact ? 'n/a' : 'Not enough data'}
      </span>
    );
  }

  const s = STYLE[status.level];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{
        padding: compact ? '0.1rem 0.45rem' : '0.2rem 0.6rem',
        background: s.background,
        color: s.color,
        border: s.border,
      }}
      title={status.reason}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, background: s.color, flexShrink: 0 }}
      />
      {/*
        Uses the label the caller supplied. An earlier version substituted a
        hardcoded word here, which meant a post on the leaderboard read
        "Urgent" no matter what the evaluator had decided to call it. The
        evaluator owns its wording, not this component.
      */}
      {compact ? (status.shortLabel ?? status.label) : status.label}
    </span>
  );
}

/**
 * Dot on its own, for dense table rows. Carries a title and an accessible
 * label so the meaning survives without the colour.
 */
export function StatusDot({ status }: { status: Status | null }) {
  const s = status ? STYLE[status.level] : null;
  const label = status ? `${status.label}: ${status.reason}` : 'Not enough data';
  return (
    <span
      className="inline-flex items-center"
      title={label}
      role="img"
      aria-label={label}
      style={{ lineHeight: 0 }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: s ? s.color : 'transparent',
          border: s ? 'none' : `1px solid ${C.border}`,
          display: 'inline-block',
        }}
      />
    </span>
  );
}

/**
 * Legend, so the colours are explained once per page rather than guessed at.
 *
 * `scale` must match what the page's badges actually say. An action legend over
 * performance badges is worse than no legend, because it tells the reader a
 * published post is something to fix.
 */
export function StatusLegend({ scale = 'action' }: { scale?: 'action' | 'performance' }) {
  const items: { level: Level; label: string }[] =
    scale === 'performance'
      ? [
          { level: 'good', label: 'Above your usual' },
          { level: 'warning', label: 'About usual' },
          { level: 'bad', label: 'Below your usual' },
        ]
      : [
          { level: 'good', label: 'Good' },
          { level: 'warning', label: 'Needs attention' },
          { level: 'bad', label: 'Work on immediately' },
        ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((i) => (
        <span key={i.level} className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
          <span
            aria-hidden
            style={{ width: 8, height: 8, borderRadius: 999, background: STYLE[i.level].color }}
          />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.muted }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 999, border: `1px solid ${C.border}` }}
        />
        Not enough data
      </span>
    </div>
  );
}
