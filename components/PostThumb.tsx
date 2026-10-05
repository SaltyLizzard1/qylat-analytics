'use client';

import { useEffect, useRef, useState } from 'react';
import { C, RADIUS } from '@/lib/theme';

/**
 * Post thumbnail that recovers, and fails gracefully when it cannot.
 *
 * Meta's CDN links expire. The sync reissues them for posts inside its
 * lookback, so recent thumbnails load and older ones stop. Three steps, in
 * order:
 *   1. the stored link
 *   2. `recoverSrc`, when given: a route that asks Meta for a new link
 *   3. `fallback`, when given, or a neutral block with the label's initial
 *
 * A broken image icon is uglier than no image, so a failed load never shows.
 *
 * The load is also checked once after mounting. An image that fails before
 * React has attached its error handler never reports the failure, and stayed
 * on screen as an empty white box.
 *
 * That check and the error handler can both see the same failure. Each one
 * names the step it saw fail, so one failed image moves on one step. When
 * both simply added one, a busy browser skipped the recovery step and showed
 * the fallback for a post whose image was never asked for.
 *
 * A plain img rather than next/image on purpose. The Vercel image optimizer
 * bills transformations, and a leaderboard of thirty thumbnails would eat the
 * Hobby allowance for no visual gain at this size.
 */
export function PostThumb({
  src,
  label,
  size = 44,
  recoverSrc,
  fallback,
}: {
  src: string | null;
  label: string;
  size?: number;
  /** Tried once if the stored link is missing or fails. */
  recoverSrc?: string;
  /** Shown when no image can be loaded. Sized by the caller to `size`. */
  fallback?: React.ReactNode;
}) {
  const sources = [src, recoverSrc].filter((s): s is string => !!s);
  const [step, setStep] = useState(0);
  const img = useRef<HTMLImageElement>(null);
  const current = sources[step];

  /** Moves past `failed` only if that is still the step on screen. */
  const failedAt = (failed: number) => setStep((s) => (s === failed ? s + 1 : s));

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) failedAt(step);
  }, [step]);

  const box = {
    width: size,
    height: size,
    borderRadius: RADIUS.md,
    flexShrink: 0,
    overflow: 'hidden',
  } as const;

  if (!current) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        style={{
          ...box,
          background: C.neutral,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.muted,
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
        aria-hidden
        title={label}
      >
        {label.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      key={current}
      src={current}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => failedAt(step)}
      style={{ ...box, objectFit: 'cover', display: 'block', background: C.neutral }}
    />
  );
}
