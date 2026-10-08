'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { groupAction, type GroupState } from '@/app/dashboard/content/actions';
import { C, RADIUS } from '@/lib/theme';

const initial: GroupState = { status: 'idle' };

const BUTTON = { borderRadius: RADIUS.pill, fontWeight: 500, cursor: 'pointer' } as const;

/** Reads the page again once a change is saved, so the cards regroup and the totals follow. */
function useRefreshOnDone(state: GroupState) {
  const router = useRouter();
  const seen = useRef<GroupState>(initial);
  useEffect(() => {
    if (state.status === 'done' && seen.current !== state) {
      seen.current = state;
      router.refresh();
    }
  }, [state, router]);
}

function Outcome({ state }: { state: GroupState }) {
  if (state.status === 'error') {
    return (
      <p className="text-xs mt-1" role="alert" style={{ color: C.text, fontWeight: 600 }}>
        {state.message}
      </p>
    );
  }
  if (state.status === 'done') {
    return (
      <p className="text-xs mt-1" role="status" style={{ color: C.muted }}>
        {state.message}
      </p>
    );
  }
  return null;
}

/**
 * One button that links, unlinks or dismisses. A real form with a real submit
 * button, so it works from the keyboard and needs no confirm step: each one
 * is undone by its opposite.
 */
export function GroupButton({
  op,
  a,
  b,
  label,
  about,
  primary = false,
}: {
  op: 'link' | 'unlink' | 'undo' | 'dismiss';
  a: number;
  b?: number;
  label: string;
  /** What the button acts on, for a screen reader. */
  about: string;
  primary?: boolean;
}) {
  const [state, action, pending] = useActionState(groupAction, initial);
  useRefreshOnDone(state);
  return (
    <form action={action}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="a" value={a} />
      {b !== undefined && <input type="hidden" name="b" value={b} />}
      <button
        type="submit"
        disabled={pending}
        aria-label={`${label}: ${about}`}
        className="text-sm px-3.5 py-1.5 disabled:opacity-50"
        style={{ ...BUTTON, background: primary ? C.ink : C.neutral, color: primary ? C.onInk : C.text }}
      >
        {pending ? 'Saving' : label}
      </button>
      <Outcome state={state} />
    </form>
  );
}

/**
 * Link by hand: pick a post from another account. This is how a copy
 * published on a different day, or a text-only post nothing suggested, gets
 * joined to its content.
 */
export function LinkPicker({ postId, options }: { postId: number; options: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState(groupAction, initial);
  useRefreshOnDone(state);
  if (options.length === 0) {
    return (
      <p className="text-xs" style={{ color: C.muted }}>
        No post on another account is free to link.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="op" value="link" />
      <input type="hidden" name="a" value={postId} />
      <label className="sr-only" htmlFor={`link-${postId}`}>
        Post on another account to link
      </label>
      <select
        id={`link-${postId}`}
        name="b"
        required
        defaultValue=""
        className="text-sm px-2 py-1.5 min-w-0"
        style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, color: C.text, flex: '1 1 220px', maxWidth: '100%' }}
      >
        <option value="" disabled>
          Choose a post on another account
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="text-sm px-3.5 py-1.5 disabled:opacity-50" style={{ ...BUTTON, background: C.ink, color: C.onInk }}>
        {pending ? 'Saving' : 'Link'}
      </button>
      <div className="w-full">
        <Outcome state={state} />
      </div>
    </form>
  );
}
