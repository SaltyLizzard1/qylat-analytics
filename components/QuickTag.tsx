'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { setPostTheme, type SetThemeState } from '@/app/admin/posts/actions';
import { PILLARS } from '@/lib/pillars';
import { C, RADIUS, tagColor, tint } from '@/lib/theme';

const initial: SetThemeState = { status: 'idle' };

/**
 * One press tags a post. The same tags and the same save as the tagging
 * screen in admin, without the free text box: this is for clearing a backlog
 * from the page that shows it.
 *
 * Each tag is its own submit button carrying the tag as its value, so it
 * works with a keyboard and needs no extra confirm step. After a save the
 * page is read again, the post leaves the list and the counts drop.
 */
export function QuickTag({ postId, about }: { postId: number; about: string }) {
  const [state, action, pending] = useActionState(setPostTheme, initial);
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    if (state.status === 'saved' && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [state, router]);

  if (state.status === 'saved') {
    const label = PILLARS.find((p) => p.slug === state.theme)?.label ?? state.theme;
    return (
      <p className="text-xs" role="status" style={{ color: C.text, fontWeight: 600 }}>
        Tagged {label}
      </p>
    );
  }

  return (
    <form action={action} aria-label={`Tag ${about}`}>
      <input type="hidden" name="post_id" value={postId} />
      <div className="flex flex-wrap gap-1.5">
        {PILLARS.map((p) => (
          <button
            key={p.slug}
            type="submit"
            name="theme"
            value={p.slug}
            disabled={pending}
            title={p.covers}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 disabled:opacity-50"
            style={{
              background: tint(tagColor(p.slug)),
              color: C.text,
              borderRadius: RADIUS.pill,
              fontWeight: 600,
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: tagColor(p.slug) }} />
            {p.label}
          </button>
        ))}
      </div>
      {pending && (
        <p className="text-xs mt-1" style={{ color: C.muted }}>
          Saving
        </p>
      )}
      {state.status === 'error' && (
        <p className="text-xs mt-1" role="alert" style={{ color: C.text, fontWeight: 600 }}>
          Not saved. {state.message}
        </p>
      )}
    </form>
  );
}
