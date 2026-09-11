'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PERIOD_CHOICES, MAX_CUSTOM_DAYS, dayLabel, type Period } from '@/lib/period';
import { C, RADIUS } from '@/lib/theme';

/**
 * The comparison window, in the URL.
 *
 * Writing to the query string rather than to local state is what makes a view
 * reproducible and shareable, and it is what lets every page read one period
 * instead of each keeping its own.
 */
export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [customOpen, setCustomOpen] = useState(period.custom);
  const [customValue, setCustomValue] = useState(String(period.days));

  function go(days: number, compare = period.compare) {
    const q = new URLSearchParams(params.toString());
    q.set('period', String(days));
    if (compare === 'previous') q.delete('compare');
    else q.set('compare', compare);
    router.push(`${pathname}?${q.toString()}`);
  }

  function applyCustom() {
    const n = Math.min(Math.max(Math.floor(Number(customValue) || 0), 1), MAX_CUSTOM_DAYS);
    setCustomValue(String(n));
    go(n);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5"
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}
    >
      <span className="text-xs uppercase" style={{ color: C.muted, letterSpacing: '0.08em' }}>
        Period
      </span>

      <div className="flex flex-wrap gap-1">
        {PERIOD_CHOICES.map((d) => {
          const active = !period.custom && period.days === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setCustomOpen(false);
                go(d);
              }}
              className="text-xs px-2.5 py-1"
              style={{
                borderRadius: RADIUS.sm,
                border: `1px solid ${active ? C.text : C.border}`,
                background: active ? C.text : C.card,
                color: active ? C.page : C.muted,
                fontWeight: active ? 600 : 400,
              }}
            >
              {d === 1 ? '24h' : `${d}d`}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className="text-xs px-2.5 py-1"
          style={{
            borderRadius: RADIUS.sm,
            border: `1px solid ${period.custom ? C.text : C.border}`,
            background: period.custom ? C.text : C.card,
            color: period.custom ? C.page : C.muted,
            fontWeight: period.custom ? 600 : 400,
          }}
        >
          Custom
        </button>
      </div>

      {customOpen && (
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            max={MAX_CUSTOM_DAYS}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCustom();
            }}
            aria-label="Custom period in days"
            style={{
              width: '4.2rem',
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: RADIUS.sm,
              color: C.text,
              fontSize: '0.78rem',
              padding: '0.2rem 0.45rem',
            }}
          />
          <span className="text-xs" style={{ color: C.muted }}>
            days
          </span>
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
        {dayLabel(period.days)}
        {period.compare === 'previous' ? ` against ${period.compareLabel}` : ', no comparison'}
      </span>

      <button
        type="button"
        onClick={() => go(period.days, period.compare === 'previous' ? 'none' : 'previous')}
        className="text-xs px-2 py-1 ml-auto"
        style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.muted, background: C.card }}
      >
        {period.compare === 'previous' ? 'Hide comparison' : 'Show comparison'}
      </button>
    </div>
  );
}
