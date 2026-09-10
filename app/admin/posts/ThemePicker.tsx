'use client';

import { useActionState, useState } from 'react';
import { setPostTheme, type SetThemeState } from './actions';
import { PILLARS } from '@/lib/pillars';
import { C, RADIUS } from '@/lib/theme';

const initialState: SetThemeState = { status: 'idle' };

const FIELD = {
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: RADIUS.sm,
  padding: '0.4rem 0.6rem',
  fontSize: '0.8rem',
  outline: 'none',
} as const;

/**
 * One click per post is the design goal. Sixty-nine posts typed by hand is a
 * chore nobody finishes, so the four pillars are buttons and the text input is
 * the escape hatch for anything that genuinely does not fit.
 */
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
  const [value, setValue] = useState(current ?? '');

  const listId = `themes-${postId}`;
  // Anything already used that is not a pillar, offered but not promoted.
  const extras = knownThemes.filter((t) => !PILLARS.some((p) => p.slug === t));

  return (
    <form action={formAction} className="flex flex-col gap-2 items-end">
      <input type="hidden" name="post_id" value={postId} />

      <div className="flex flex-wrap gap-1 justify-end">
        {PILLARS.map((p) => {
          const active = value === p.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setValue(p.slug)}
              title={p.covers}
              className="text-xs px-2 py-1 transition-colors"
              style={{
                borderRadius: RADIUS.sm,
                border: `1px solid ${active ? C.text : C.border}`,
                background: active ? C.text : C.card,
                color: active ? C.page : C.muted,
                fontWeight: active ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          name="theme"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="untagged"
          list={listId}
          aria-label="Content theme"
          style={{ ...FIELD, width: '11rem' }}
        />
        <datalist id={listId}>
          {PILLARS.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
          {extras.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <button
          type="submit"
          disabled={isPending}
          className="text-xs px-2.5 py-1.5 flex-shrink-0 disabled:opacity-50"
          style={{
            background: C.text,
            color: C.page,
            border: `1px solid ${C.text}`,
            borderRadius: RADIUS.sm,
          }}
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
      </div>
    </form>
  );
}
