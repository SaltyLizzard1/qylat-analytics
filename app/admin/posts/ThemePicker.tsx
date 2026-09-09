'use client';

import { useActionState } from 'react';
import { setPostTheme, type SetThemeState } from './actions';
import { C } from '@/lib/theme';

const initialState: SetThemeState = { status: 'idle' };

const FIELD = {
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: '0.375rem',
  padding: '0.4rem 0.6rem',
  fontSize: '0.8rem',
  outline: 'none',
  width: '100%',
} as const;

export function ThemePicker({
  postId,
  current,
  knownThemes,
}: {
  postId: number;
  current: string | null;
  knownThemes: string[];
}) {
  const [state, formAction, isPending] = useActionState(setPostTheme, initialState);

  const listId = `themes-${postId}`;

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="post_id" value={postId} />

      <input
        type="text"
        name="theme"
        defaultValue={current ?? ''}
        placeholder="untagged"
        list={listId}
        aria-label="Content theme"
        style={{ ...FIELD, maxWidth: '13rem' }}
      />
      <datalist id={listId}>
        {knownThemes.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <button
        type="submit"
        disabled={isPending}
        className="text-xs px-2.5 py-1.5 rounded flex-shrink-0 disabled:opacity-50"
        style={{ background: C.text, color: C.page, border: `1px solid ${C.text}` }}
      >
        {isPending ? 'Saving' : 'Save'}
      </button>

      {state.status === 'saved' && (
        <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>
          {state.theme ? 'Saved' : 'Cleared'}
        </span>
      )}
      {state.status === 'error' && (
        <span className="text-xs flex-shrink-0" style={{ color: '#B00020' }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
