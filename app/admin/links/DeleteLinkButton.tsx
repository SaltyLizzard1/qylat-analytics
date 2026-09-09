'use client';

import { useActionState } from 'react';
import { deleteLink, DeleteLinkState } from './actions';

const initialState: DeleteLinkState = { status: 'idle' };

export function DeleteLinkButton({ slug }: { slug: string }) {
  const [state, formAction, isPending] = useActionState(
    (_prev: DeleteLinkState, formData: FormData) => deleteLink(_prev, formData.get('slug') as string),
    initialState
  );

  const handleClick = () => {
    if (window.confirm('Delete this link?')) {
      const formData = new FormData();
      formData.set('slug', slug);
      formAction(formData);
    }
  };

  if (state.status === 'error') {
    return (
      <span className="text-xs" style={{ color: '#DC2626' }}>
        {state.message}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="px-2.5 py-1 rounded text-xs font-medium transition-opacity disabled:opacity-50"
      style={{
        background: '#FFFFFF',
        color: '#DC2626',
        border: '1px solid #DC2626',
      }}
    >
      {isPending ? 'Deleting...' : 'Delete'}
    </button>
  );
}
