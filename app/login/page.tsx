'use client';

import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0F0A05' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-bold tracking-wide"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#FBF6E3' }}
          >
            QYLAT
          </h1>
          <p className="mt-1 text-sm uppercase tracking-widest" style={{ color: '#8A7A60' }}>
            Analytics
          </p>
          <div
            className="mx-auto mt-4 h-px w-16"
            style={{ background: 'linear-gradient(90deg, transparent, #E8C84A, transparent)' }}
          />
        </div>

        <form action={formAction} className="space-y-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            autoFocus
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors"
            style={{
              background: '#1A1008',
              border: '1px solid #3A2210',
              color: '#FBF6E3',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#E8C84A')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#3A2210')}
          />

          {state?.error && (
            <p className="text-sm" style={{ color: '#E8A87C' }}>
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-lg text-sm font-semibold tracking-wide transition-opacity disabled:opacity-50"
            style={{
              background:
                'linear-gradient(135deg, #8B6914 0%, #E8C84A 35%, #F5E070 55%, #C9A030 75%, #8B6914 100%)',
              border: '1.5px solid #2D1A00',
              color: '#2D1A00',
            }}
          >
            {isPending ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
