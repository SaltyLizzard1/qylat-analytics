'use client';

import { useActionState } from 'react';
import { C, RADIUS } from '@/lib/theme';
import { severityBad } from '@/lib/severity';
import { deleteLink, DeleteLinkState } from './actions';

const initialState: DeleteLinkState = { status: 'idle' };

/**
 * Status colour comes from lib/severity.ts and nowhere else.
 *
 * This used to hardcode #DC2626, which is not the project's status red. Two
 * reds on one screen read as two different states, and neither was the one the
 * palette was validated against.
 */
export function DeleteLinkButton({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    (_prev: DeleteLinkState, formData: FormData) =>
      deleteLink(_prev, formData.get('slug') as string),
    initialState
  );

  const handleClick = () => {
    if (window.confirm('Delete this link?')) {
      const formData = new FormData();
      formData.set('slug', slug);
      formAction(formData);
    }
  };

  // The refusal message names the counts that block the delete, so it is the
  // useful thing on screen once it appears. It replaces the button rather than
  // sitting beside it.
  if (state.status === 'error') {
    return (
      <span className="text-xs" style={{ color: severityBad.color }}>
        {state.message}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-50"
      style={{
        background: C.card,
        color: severityBad.color,
        border: severityBad.border,
        borderRadius: RADIUS.sm,
      }}
    >
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}
