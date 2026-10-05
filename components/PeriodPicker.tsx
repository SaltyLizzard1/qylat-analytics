'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PERIOD_CHOICES, PERIOD_COOKIE, applyPeriod, type Period, type PeriodKind } from '@/lib/period';
import { C, CARD, EYEBROW, RADIUS } from '@/lib/theme';

/**
 * The comparison window, in the URL.
 *
 * Writing to the query string rather than to local state is what makes a view
 * reproducible and shareable, and it is what lets every page read one period
 * instead of each keeping its own.
 *
 * Three ways to pick a window: rolling presets, calendar months, and a custom
 * date range. All three resolve in lib/period.ts, so this component only
 * writes parameters and never does date arithmetic of its own.
 *
 * The choices sit in one segmented track. The selected one is filled with ink,
 * and is also marked aria-pressed, so the state does not rest on the fill.
 * With `bare` the control draws no surface of its own, for use inside a
 * filter bar that already has one.
 */
export function PeriodPicker({ period, bare = false }: { period: Period; bare?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customOpen, setCustomOpen] = useState(period.custom);
  const [from, setFrom] = useState(period.startDate);
  const [to, setTo] = useState(period.endDate);

  function push(next: Partial<Pick<Period, 'kind' | 'days' | 'compare' | 'startDate' | 'endDate'>>) {
    const q = new URLSearchParams(params.toString());
    applyPeriod(q, {
      kind: period.kind,
      days: period.days,
      compare: period.compare,
      startDate: period.startDate,
      endDate: period.endDate,
      ...next,
    });
    remember(q);
    router.push(`${pathname}?${q.toString()}`);
  }

  function applyCustom() {
    if (!from || !to) return;
    push({ kind: 'custom', startDate: from, endDate: to });
  }

  const calendar: { kind: PeriodKind; label: string }[] = [
    { kind: 'this-month', label: 'This month' },
    { kind: 'last-month', label: 'Last month' },
  ];
  const comparing = period.compare === 'previous';

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${bare ? '' : 'px-4 py-3'}`}
      style={bare ? undefined : CARD}
    >
      <span style={EYEBROW}>Period</span>

      <div
        className="flex flex-wrap gap-0.5 p-0.5"
        role="group"
        aria-label="Period"
        style={{ background: C.neutral, borderRadius: RADIUS.md }}
      >
        {PERIOD_CHOICES.map((d) => (
          <Segment
            key={d}
            active={period.kind === 'rolling' && period.days === d}
            onClick={() => {
              setCustomOpen(false);
              push({ kind: 'rolling', days: d });
            }}
          >
            {d === 1 ? '24h' : `${d}d`}
          </Segment>
        ))}
        {calendar.map((c) => (
          <Segment
            key={c.kind}
            active={period.kind === c.kind}
            onClick={() => {
              setCustomOpen(false);
              push({ kind: c.kind });
            }}
          >
            {c.label}
          </Segment>
        ))}
        <Segment active={period.custom} onClick={() => setCustomOpen((v) => !v)}>
          Custom
        </Segment>
      </div>

      {customOpen && (
        <span className="flex flex-wrap items-center gap-1.5">
          <DateInput value={from} onChange={setFrom} label="From" />
          <span className="text-xs" style={{ color: C.muted }}>
            to
          </span>
          <DateInput value={to} onChange={setTo} label="To" />
          <button
            type="button"
            onClick={applyCustom}
            className="text-xs px-3 py-1.5"
            style={{ background: C.ink, color: C.onInk, borderRadius: RADIUS.sm, fontWeight: 600, cursor: 'pointer' }}
          >
            Apply
          </button>
        </span>
      )}

      {/* The window is never implicit. */}
      <span className="text-xs" style={{ color: C.muted }}>
        <span style={{ color: C.text, fontWeight: 600 }}>{period.label}</span>
        {comparing ? ` against ${period.compareLabel}` : ', no comparison'}
      </span>

      <button
        type="button"
        onClick={() => push({ compare: comparing ? 'none' : 'previous' })}
        className="text-xs pl-1.5 pr-3 py-1 ml-auto inline-flex items-center gap-2"
        style={{ background: C.neutral, borderRadius: RADIUS.pill, color: C.text, fontWeight: 600, cursor: 'pointer' }}
      >
        {/* A small switch. The words beside it name the action, as before. */}
        <span
          aria-hidden
          style={{
            width: 26,
            height: 16,
            borderRadius: RADIUS.pill,
            background: comparing ? C.ink : C.border,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: comparing ? 12 : 2,
              width: 12,
              height: 12,
              borderRadius: RADIUS.pill,
              background: C.card,
            }}
          />
        </span>
        {comparing ? 'Hide comparison' : 'Show comparison'}
      </button>
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-xs px-2.5 py-1.5"
      style={{
        borderRadius: RADIUS.sm,
        background: active ? C.ink : 'transparent',
        color: active ? C.onInk : C.text,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Keeps the chosen period for a year, so the Overview can open on it when the
 * address names no period. Only the period is kept, never the account or
 * anything else, and an address that names a period always wins.
 */
function remember(q: URLSearchParams) {
  const kept = new URLSearchParams();
  for (const key of ['period', 'from', 'to', 'compare']) {
    const value = q.get(key);
    if (value) kept.set(key, value);
  }
  try {
    document.cookie = `${PERIOD_COOKIE}=${encodeURIComponent(kept.toString())}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    // A browser that refuses cookies just opens on the default next time.
  }
}

/** Native date input. No library: the browser's own picker is enough and weighs nothing. */
function DateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS.sm,
        color: C.text,
        fontSize: '0.8rem',
        padding: '0.25rem 0.5rem',
      }}
    />
  );
}
