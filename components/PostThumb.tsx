'use client';

import { useState } from 'react';
import { C, RADIUS } from '@/lib/theme';

/**
 * Post thumbnail with a graceful failure.
 *
 * Meta's CDN URLs expire. The sync refreshes them for posts inside its lookback
 * window, so recent thumbnails load and older ones eventually will not. A
 * broken image icon is uglier than no image, so a failed load falls back to a
 * neutral block carrying the format initial.
 *
 * A plain img rather than next/image on purpose. The Vercel image optimizer
 * bills transformations, and a leaderboard of thirty thumbnails would eat the
 * Hobby allowance for no visual gain at this size.
 */
export function PostThumb({
  src,
  label,
  size = 44,
}: {
  src: string | null;
  label: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  const box = {
    width: size,
    height: size,
    borderRadius: RADIUS.sm,
    flexShrink: 0,
    border: `1px solid ${C.border}`,
    overflow: 'hidden',
  } as const;

  if (!src || failed) {
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
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...box, objectFit: 'cover', display: 'block' }}
    />
  );
}
