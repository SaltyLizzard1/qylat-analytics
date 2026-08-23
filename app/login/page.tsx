'use client';

import { useActionState } from 'react';
import { login } from './actions';
import { severityBad } from '@/lib/severity';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FFFFFF' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1
            className="text-4xl tracking-wide"
            style={{ fontWeight: 600, color: '#111111' }}
          >
            QYLAT
          </h1>
          <p className="mt-1 text-sm uppercase tracking-widest" style={{ color: '#555555' }}>
            Analytics
          </p>
          <div className="mx-auto mt-4 h-px w-16" style={{ background: '#D0D0D0' }} />
        </div>

        <form action={formAction} className="space-y-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoFocus
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{
              background: '#FFFFFF',
              border: '1px solid #D0D0D0',
              color: '#111111',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#111111')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#D0D0D0')}
          />

          {state?.error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={severityBad}>
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-lg text-sm font-semibold tracking-wide transition-opacity disabled:opacity-50"
            style={{
              background: '#111111',
              border: '1px solid #111111',
              color: '#FFFFFF',
            }}
          >
            {isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
