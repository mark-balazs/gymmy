'use client';

/**
 * A photograph, as large as the screen allows.
 *
 * The exercise sheet shows its two photographs side by side in a 4:3 box, which
 * crops them and leaves each about a third of the width of a phone. That is
 * enough to recognise a movement you already know and not enough to learn one
 * you do not — where the bar sits, how far the knee travels, which way the
 * elbow points are all decided in the pixels that framing throws away.
 *
 * So tapping one opens it uncropped and full-bleed. Deliberately not a `Sheet`:
 * a bottom sheet is a panel with the page behind it, and the whole point here is
 * that nothing else is on screen.
 *
 * Portalled to the body rather than rendered where it is used. It opens from
 * inside a sheet, and that sheet is a `backdrop-blur` overlay wrapping a panel
 * that animates on `transform` — either of which makes itself the containing
 * block for a `position: fixed` descendant, so "cover the screen" would quietly
 * become "cover the sheet". A portal takes the question off the table instead of
 * relying on the sheet's styling never changing.
 */

import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, cn } from '@/components/ui';
import { useT } from '@/lib/client/hooks';

export interface Shot {
  src: string;
  /** What this photograph is of, already translated. */
  alt: string;
}

export function Lightbox({
  shots,
  index,
  onIndex,
  onClose,
}: {
  shots: Shot[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const tr = useT();
  const count = shots.length;

  const step = useCallback(
    (by: number) => onIndex((index + by + count) % count),
    [index, count, onIndex],
  );

  /*
   * Captured, and stopped once handled.
   *
   * The sheet this opens from listens for Escape on the same document, and it
   * registered first — so one press closed the photograph and the sheet behind
   * it in the same breath, which is not what anybody means by Escape. A capture
   * listener runs before every bubble listener on document, so the overlay on
   * top gets the key and keeps it.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Arrow keys are what a keyboard user reaches for in anything paged, and
      // without them this is a gallery you can open but not read.
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else return;
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => document.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose, step]);

  const shot = shots[index];
  // Only ever mounted from a tap, so there is no server render to guard — the
  // check is there so a future caller rendering it eagerly fails to appear
  // rather than taking the page down.
  if (!shot || typeof document === 'undefined') return null;

  return createPortal(
    <div
      /* Above the sheet it opens from, and `100dvh` for the same reason the
         sheet uses it: sized to the layout viewport it runs under a phone's
         address bar. */
      className="animate-fade fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-black/92 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={shot.alt}
      // A horizontal drag here pages the gallery; it must not also change tab.
      data-no-swipe
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{shot.alt}</span>
        <Button
          variant="ghost"
          className="-mr-1 min-h-11 shrink-0 px-3 text-white"
          aria-label={tr.t('common.close')}
          onClick={onClose}
        >
          ✕
        </Button>
      </div>

      {/* The photograph is `contain`, not `cover`: cropping is exactly what
          this view exists to undo. */}
      <button
        type="button"
        aria-label={tr.t('common.close')}
        onClick={onClose}
        className="flex min-h-0 flex-1 cursor-zoom-out items-center justify-center p-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element --
            fixed-size static files that need no transforming, and the
            optimizer is a metered per-request function in front of something
            already on disk. */}
        <img src={shot.src} alt={shot.alt} className="max-h-full max-w-full object-contain" />
      </button>

      {count > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <Button
            variant="ghost"
            className="min-h-11 px-4 text-white"
            aria-label={tr.t('common.previous')}
            onClick={() => step(-1)}
          >
            ‹
          </Button>
          {/* Dots rather than "1 / 2": with two photographs the count is the
              same information and one glyph fewer to read. */}
          <div className="flex items-center gap-1.5">
            {shots.map((s, i) => (
              <span
                key={s.src}
                className={cn('h-1.5 w-1.5 rounded-full', i === index ? 'bg-white' : 'bg-white/35')}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            className="min-h-11 px-4 text-white"
            aria-label={tr.t('common.next')}
            onClick={() => step(1)}
          >
            ›
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
