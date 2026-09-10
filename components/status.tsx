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
      {compact ? SHORT[status.level] : status.label}
    </span>
  );
}

const SHORT: Record<Level, string> = { good: 'Good', warning: 'Attention', bad: 'Urgent' };

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

/** Legend, so the colours are explained once per page rather than guessed at. */
export function StatusLegend() {
  const items: { level: Level; label: string }[] = [
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
