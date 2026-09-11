'use client';

import { useActionState } from 'react';
import { runSync, type SyncState } from './actions';
import { severityGood, severityBad, severityWarning } from '@/lib/severity';
import { C, RADIUS } from '@/lib/theme';

const initial: SyncState = { status: 'idle' };

/**
 * One button per source. Deliberately not one "sync everything" button: when a
 * run goes wrong you want to know which source failed, and Meta and Google
 * fail for completely different reasons.
 */
export function SyncButtons() {
  const [state, formAction, isPending] = useActionState(runSync, initial);

  return (
    <div>
      <form action={formAction} className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="which"
          value="meta"
          disabled={isPending}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: C.text, color: C.page, border: `1px solid ${C.text}`, borderRadius: RADIUS.sm }}
        >
          {isPending ? 'Syncing...' : 'Sync Facebook and Instagram'}
        </button>
        <button
          type="submit"
          name="which"
          value="ga"
          disabled={isPending}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: RADIUS.sm }}
        >
          {isPending ? 'Syncing...' : 'Sync Google Analytics'}
        </button>
      </form>

      {isPending && (
        <p className="text-sm mt-3" style={{ color: C.muted }}>
          Running. Meta takes a few seconds per post, so a full run can take up to a minute.
        </p>
      )}

      {state.status === 'error' && (
        <div className="text-sm mt-3 px-3 py-2" style={{ ...severityBad, borderRadius: RADIUS.sm }}>
          <b>Sync failed.</b> {state.message}
        </div>
      )}

      {state.status === 'done' && (
        <div className="mt-3 flex flex-col gap-2">
          <div
            className="text-sm px-3 py-2"
            style={{
              ...(state.warnings.length ? severityWarning : severityGood),
              borderRadius: RADIUS.sm,
            }}
          >
            <b>{state.which} sync finished.</b> {state.summary}
          </div>
          {state.warnings.map((w, i) => (
            <div
              key={i}
              className="text-xs px-3 py-2"
              style={{ ...severityWarning, borderRadius: RADIUS.sm }}
            >
              {w}
            </div>
          ))}
          <p className="text-xs" style={{ color: C.muted }}>
            The dashboard has been refreshed. Nothing is swallowed: any source that failed is listed
            above rather than reported as success.
          </p>
        </div>
      )}
    </div>
  );
}
