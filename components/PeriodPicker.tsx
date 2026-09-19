'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PERIOD_CHOICES, applyPeriod, type Period, type PeriodKind } from '@/lib/period';
import { C, RADIUS } from '@/lib/theme';

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
 */
export function PeriodPicker({ period }: { period: Period }) {
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

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}
    >
      <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
        Period
      </span>

      <div className="flex flex-wrap gap-1">
        {PERIOD_CHOICES.map((d) => (
          <Chip
            key={d}
            active={period.kind === 'rolling' && period.days === d}
            onClick={() => {
              setCustomOpen(false);
              push({ kind: 'rolling', days: d });
            }}
          >
            {d === 1 ? '24h' : `${d}d`}
          </Chip>
        ))}
        {calendar.map((c) => (
          <Chip
            key={c.kind}
            active={period.kind === c.kind}
            onClick={() => {
              setCustomOpen(false);
              push({ kind: c.kind });
            }}
          >
            {c.label}
          </Chip>
        ))}
        <Chip active={period.custom} onClick={() => setCustomOpen((v) => !v)}>
          Custom
        </Chip>
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
            className="text-xs px-2 py-1"
            style={{ background: C.text, color: C.page, border: `1px solid ${C.text}`, borderRadius: RADIUS.sm }}
          >
            Apply
          </button>
        </span>
      )}

      {/* The window is never implicit. */}
      <span className="text-xs" style={{ color: C.muted }}>
        {period.label}
        {period.compare === 'previous' ? ` against ${period.compareLabel}` : ', no comparison'}
      </span>

      <button
        type="button"
        onClick={() => push({ compare: period.compare === 'previous' ? 'none' : 'previous' })}
        className="text-xs px-2 py-1 ml-auto"
        style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.muted, background: C.card }}
      >
        {period.compare === 'previous' ? 'Hide comparison' : 'Show comparison'}
      </button>
    </div>
  );
}

function Chip({
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
      className="text-xs px-2.5 py-1"
      style={{
        borderRadius: RADIUS.sm,
        border: `1px solid ${active ? C.text : C.border}`,
        background: active ? C.text : C.card,
        color: active ? C.page : C.muted,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
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
        fontSize: '0.78rem',
        padding: '0.2rem 0.45rem',
      }}
    />
  );
}
