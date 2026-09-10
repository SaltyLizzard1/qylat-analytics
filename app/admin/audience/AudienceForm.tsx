'use client';

import { useActionState } from 'react';
import { saveAudienceEntry, deleteAudienceEntry, type AudienceEntryState } from './actions';
import { C } from '@/lib/theme';

const initialState: AudienceEntryState = { status: 'idle' };

const FIELD = {
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: '0.375rem',
  padding: '0.55rem 0.75rem',
  fontSize: '0.85rem',
  outline: 'none',
  width: '100%',
} as const;

export function AudienceForm({
  options,
  today,
}: {
  options: { value: string; label: string; manualOnly: boolean }[];
  today: string;
}) {
  const [state, formAction, isPending] = useActionState(saveAudienceEntry, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>
          Account
        </label>
        <select name="platform" style={FIELD} defaultValue="facebook-personal">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
              {o.manualOnly ? '' : ' (also synced automatically)'}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>
            Followers
          </label>
          <input
            type="number"
            name="followers"
            min={0}
            step={1}
            required
            placeholder="1240"
            style={FIELD}
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: C.muted }}>
            As of
          </label>
          <input type="date" name="recorded_on" defaultValue={today} max={today} style={FIELD} />
        </div>
      </div>

      {state.status === 'error' && (
        <p className="text-sm" style={{ color: '#B00020' }}>
          {state.message}
        </p>
      )}
      {state.status === 'saved' && (
        <p className="text-sm" style={{ color: C.muted }}>
          Saved {state.followers.toLocaleString()} followers.
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: C.text, color: C.page, border: `1px solid ${C.text}` }}
      >
        {isPending ? 'Saving...' : 'Save entry'}
      </button>
    </form>
  );
}

export function DeleteEntryButton({ id }: { id: number }) {
  const [state, formAction, isPending] = useActionState(deleteAudienceEntry, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
        className="text-xs px-2 py-1 rounded disabled:opacity-50"
        style={{ background: C.card, color: '#B00020', border: '1px solid #B00020' }}
      >
        {isPending ? '...' : 'Delete'}
      </button>
      {state.status === 'error' && (
        <span className="text-xs ml-2" style={{ color: '#B00020' }}>
          {state.message}
        </span>
      )}
    </form>
  );
}
