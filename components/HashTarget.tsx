'use client';

import { useEffect } from 'react';

/**
 * Lands on the row named in the address after "#" and marks it.
 *
 * A chart mark that stands for one post links to the post list with the
 * post's id as the fragment. Moving between pages inside the app does not set
 * the browser's own :target, so the ring in globals.css would never show and
 * the row could sit below the fold. This reads the fragment once the page is
 * there, brings the row into view and marks it. It draws nothing itself.
 */
export function HashTarget() {
  useEffect(() => {
    function mark() {
      for (const el of document.querySelectorAll('[data-target]')) el.removeAttribute('data-target');
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.setAttribute('data-target', '');
      el.scrollIntoView({ block: 'start' });
    }
    mark();
    window.addEventListener('hashchange', mark);
    return () => window.removeEventListener('hashchange', mark);
  }, []);
  return null;
}
