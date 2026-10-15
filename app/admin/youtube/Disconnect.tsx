'use client';

import { useActionState } from 'react';
import { disconnectYouTube, type DisconnectState } from './actions';
import { severityBad } from '@/lib/severity';

export function Disconnect() {
  const [state, action, pending] = useActionState<DisconnectState, FormData>(disconnectYouTube, { status: 'idle' });
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="confirm" value="yes" className="mt-1" />
        <span>Revoke access at Google and delete the stored token and every stored YouTube Analytics figure.</span>
      </label>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="px-3 py-1.5 rounded text-sm"
          style={{ border: '1px solid #D0D0D0', background: '#FFFFFF', color: '#111111', fontWeight: 500 }}
        >
          {pending ? 'Disconnecting' : 'Disconnect'}
        </button>
      </div>
      {state.status === 'error' && <p style={{ color: severityBad.color }}>Not disconnected: {state.message}</p>}
    </form>
  );
}
