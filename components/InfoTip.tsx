'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { C, RADIUS, SHADOW } from '@/lib/theme';

/**
 * An explanation that stays out of the way until asked for.
 *
 * A real button, so it works three ways: a tap, a click, or Tab then Enter or
 * Space. It was a hover title before, which a phone never shows and a keyboard
 * cannot reach. The explanation opens in a small panel that can be dismissed
 * by its own close button, by Escape, by pressing the "i" again, or by
 * pressing anywhere else. Escape and the close button return focus to the "i".
 *
 * On a phone the panel sits along the bottom of the screen, where it cannot
 * run off an edge. On a wider screen it hangs under the button.
 *
 * The label and the number being explained are always visible. Only the
 * "why" is folded away.
 */
export function InfoTip({ text, about }: { text: string; about?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const name = about ? `Explain ${about}` : 'Explain this figure';

  return (
    // Above a card's stretched link, so pressing the "i" never follows the card.
    <span ref={wrap} className="relative inline-flex" style={{ zIndex: open ? 30 : 2, flexShrink: 0 }}>
      <button
        ref={button}
        type="button"
        aria-label={open ? 'Hide the explanation' : name}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
        style={{
          // 24px is the smallest target that is comfortable to tap.
          width: 24,
          height: 24,
          margin: -4,
          borderRadius: RADIUS.pill,
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <span
          aria-hidden
          className="inline-flex items-center justify-center"
          style={{
            width: 16,
            height: 16,
            borderRadius: RADIUS.pill,
            border: `1px solid ${open ? C.text : C.border}`,
            background: open ? C.text : C.card,
            color: open ? C.onInk : C.muted,
            fontSize: '0.62rem',
            fontWeight: 600,
          }}
        >
          i
        </span>
      </button>

      {open && (
        <span
          id={id}
          role="note"
          className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 flex items-start gap-2 text-xs leading-relaxed text-left"
          style={{
            background: C.card,
            color: C.text,
            border: `1px solid ${C.text}`,
            borderRadius: RADIUS.md,
            boxShadow: SHADOW,
            padding: '0.7rem 0.75rem',
            textTransform: 'none',
            letterSpacing: 'normal',
            fontWeight: 400,
          }}
        >
          <span style={{ flex: 1 }}>{text}</span>
          <button
            type="button"
            aria-label="Close the explanation"
            onClick={() => {
              setOpen(false);
              button.current?.focus();
            }}
            className="inline-flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
            style={{
              width: 24,
              height: 24,
              flexShrink: 0,
              borderRadius: RADIUS.sm,
              border: `1px solid ${C.border}`,
              background: C.neutral,
              color: C.text,
              cursor: 'pointer',
              fontSize: '0.85rem',
              lineHeight: 1,
            }}
          >
            <span aria-hidden>×</span>
          </button>
        </span>
      )}
    </span>
  );
}
