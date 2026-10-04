'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { requestProfileCollection, type CollectState } from './profile-actions';
import { severityGood, severityBad, severityWarning } from '@/lib/severity';
import { C, RADIUS } from '@/lib/theme';

export type RunView = {
  /** Status colour only for an outcome. Waiting and running are not judged. */
  tone: 'none' | 'good' | 'warning' | 'bad';
  open: boolean;
  /** The request is written and unclaimed, so the collector can still be opened. */
  launch: boolean;
  headline: string;
  lines: string[];
  link?: boolean;
  /** The last run hit a login form or checkpoint. Pressing again before
   *  --setup would send the same rejected session back to Facebook. */
  afterSessionFailure: boolean;
};

const REFRESH_MS = 20_000;

/**
 * Windows hands this link to scripts/personal-fb/collect.py once
 * register-protocol.ps1 has been run on the laptop. The link carries nothing:
 * collect.py runs only if it can claim the request this page just wrote.
 */
const COLLECTOR_LINK = 'qylat-collect:run';
const initial: CollectState = { status: 'idle' };

export function ProfileCollectButton({ view }: { view: RunView }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(requestProfileCollection, initial);

  // The request is written: open the collector on this laptop, and reread the
  // page so its status shows. On a device without the collector the browser
  // ignores the link and the request is withdrawn a few minutes later.
  useEffect(() => {
    if (state.status !== 'requested') return;
    window.location.href = COLLECTOR_LINK;
    router.refresh();
  }, [state, router]);

  // While a request is open, follow it until the laptop reports back.
  useEffect(() => {
    if (!view.open) return;
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [view.open, router]);

  const toneStyle =
    view.tone === 'good'
      ? severityGood
      : view.tone === 'warning'
        ? severityWarning
        : view.tone === 'bad'
          ? severityBad
          : { background: C.neutral, color: C.text, border: `1px solid ${C.border}` };

  const label = view.open
    ? 'Collection requested'
    : view.afterSessionFailure
      ? 'I have run --setup. Collect again'
      : 'Collect Facebook profile';

  return (
    <div>
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending || view.open}
          className="px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: RADIUS.sm }}
        >
          {isPending ? 'Requesting...' : label}
        </button>
      </form>
      <p className="text-xs mt-2" style={{ color: C.muted, maxWidth: '70ch' }}>
        Runs on the laptop, not here: it needs the logged in Chrome profile there. Pressing this opens
        the collector on the laptop. Nothing runs in the background between presses.
      </p>

      {state.status === 'error' && (
        <div className="text-sm mt-3 px-3 py-2" style={{ ...severityBad, borderRadius: RADIUS.sm }}>
          <b>Not requested.</b> {state.message}
        </div>
      )}

      <div className="text-sm mt-3 px-3 py-2" style={{ ...toneStyle, borderRadius: RADIUS.sm }}>
        <b>Facebook profile:</b> {view.headline}
        {view.link && (
          <>
            {' '}
            <Link href="/dashboard/profile" style={{ color: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
              View profile <span aria-hidden>→</span>
            </Link>
          </>
        )}
        {view.launch && (
          <>
            {' '}
            <a href={COLLECTOR_LINK} style={{ color: 'inherit', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Open the collector
            </a>
          </>
        )}
        {view.lines.length > 0 && (
          <ul className="text-xs mt-1.5 space-y-0.5" style={{ opacity: 0.9 }}>
            {view.lines.map((l, i) => (
              <li key={i} style={{ overflowWrap: 'anywhere' }}>
                {l}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
