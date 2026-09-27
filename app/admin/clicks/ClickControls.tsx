'use client';

import { useActionState } from 'react';
import { C, RADIUS } from '@/lib/theme';
import { severityBad, severityGood } from '@/lib/severity';
import {
  setClickIsTest,
  setSessionIsTest,
  reclassifyClicks,
  type ClickActionState,
} from './actions';

const initialState: ClickActionState = { status: 'idle' };

/**
 * Every control here reports its own outcome in place.
 *
 * A failed server action used to leave the page looking unchanged, which on a
 * page whose whole job is trustworthy counts is the worst possible behaviour.
 * Each button renders the error text the action returned, verbatim.
 */

const buttonBase = {
  background: C.card,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.sm,
} as const;

function Feedback({ state }: { state: ClickActionState }) {
  if (state.status === 'error') {
    return (
      <span className="text-xs" style={{ color: severityBad.color }}>
        {state.message}
      </span>
    );
  }
  if (state.status === 'success') {
    return (
      <span className="text-xs" style={{ color: severityGood.color }}>
        {state.message}
      </span>
    );
  }
  return null;
}

/** Mark or unmark one click as a test. */
export function TestToggle({ id, isTest }: { id: string; isTest: boolean }) {
  const [state, formAction, isPending] = useActionState(setClickIsTest, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2 flex-shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="next" value={isTest ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={isPending}
        className="px-2 py-0.5 text-xs transition-opacity disabled:opacity-50 whitespace-nowrap"
        style={buttonBase}
        title={
          isTest
            ? 'Stop treating this click as one of your own tests'
            : 'Mark this click as one of your own tests. It stays in the log and stops being counted.'
        }
      >
        {isPending ? '...' : isTest ? 'Not a test' : 'Mark test'}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Mark every click from one browser as Liz's own.
 *
 * The cookie, not the row, is the useful unit: one test session is usually
 * several clicks across several days from the same machine.
 */
export function SessionToggle({
  sessionId,
  isTest,
  count,
}: {
  sessionId: string;
  isTest: boolean;
  count: number;
}) {
  const [state, formAction, isPending] = useActionState(setSessionIsTest, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="next" value={isTest ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={isPending}
        className="px-2.5 py-1 text-xs transition-opacity disabled:opacity-50 whitespace-nowrap"
        style={buttonBase}
        title={`${count} ${count === 1 ? 'click' : 'clicks'} share this browser cookie`}
      >
        {isPending
          ? 'Saving...'
          : isTest
            ? `Not mine (${count})`
            : `This browser is mine (${count})`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/** Rejudge every stored click against the current rules. */
export function ReclassifyButton({ stale }: { stale: number }) {
  const [state, formAction, isPending] = useActionState(reclassifyClicks, initialState);

  return (
    <form action={formAction} className="flex items-center gap-3 flex-wrap">
      <button
        type="submit"
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50"
        style={
          stale > 0
            ? { background: C.text, color: C.card, border: `1px solid ${C.text}`, borderRadius: RADIUS.sm }
            : buttonBase
        }
        title="Recompute every click's classification from its stored user agent, using the current rules"
      >
        {isPending ? 'Rejudging...' : 'Reclassify all clicks'}
      </button>
      <Feedback state={state} />
    </form>
  );
}
