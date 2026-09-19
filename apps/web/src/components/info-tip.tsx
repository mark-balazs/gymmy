'use client';

/**
 * The ⓘ: an explanation kept one tap away instead of written on the screen.
 *
 * Two modes, one look:
 *
 * - **A tip** — `<InfoTip label="…">up to about three sentences</InfoTip>`. A
 *   small popover anchored to the ⓘ. A second tap, a tap anywhere else or
 *   Escape closes it; opening another closes this one.
 * - **A sheet** — `<InfoTip label="…" onOpen={…} />`, for anything longer: lists,
 *   the person's own numbers, pictures. The ⓘ opens the existing sheet.
 *
 * Only for explanations. Text that stops a wrong entry, lost data or a blank
 * screen — a state, a warning, the consequence of a destructive action — stays
 * on the screen.
 *
 * **The label names the subject** ("More on Load the bar"), and never starts
 * with "About ": that is the exercise names' button, which opens the exercise
 * sheet, and the tests count those by it. The mark is different too — a filled
 * disc here, an outlined "i" beside an exercise name.
 *
 * **How the tip works**, and why each part is there:
 *
 * - A native popover (`popover="auto"`, opened by `popovertarget`). It sits in
 *   the top layer, so a faded card, a transformed sheet or a clipped scroller
 *   around it changes nothing, and nothing moves when it opens. One `auto`
 *   popover closes the others, so only one is ever open. The button is its
 *   invoker, so a second tap closes it rather than closing and reopening.
 * - A `span`, placed straight after the button: valid inside a paragraph or a
 *   label row, and read in order by a screen reader. `role="note"`, not
 *   `tooltip` (hover text iOS cannot reach) or `dialog` (it is not modal, and
 *   tests scope to the one dialog on screen).
 * - The button is described by the tip's text even while it is closed, so a
 *   screen reader hears the explanation on landing on the ⓘ.
 * - Placed by `placeTip` before its first frame, and again as the page or a
 *   sheet scrolls; closed once the ⓘ scrolls off the screen.
 * - Escape is taken in the capture phase on `window` and stopped there: a sheet
 *   listens for Escape on `document`, and one press must close the tip, not
 *   the sheet under it (the rule the keypad and the lightbox follow).
 * - A tap outside closes it by hand as well, because Safari before 18.3 does
 *   not dismiss a popover on an outside tap.
 *
 * Placement rules for callers: never inside a `<button>`, `<a>` or `<label>`
 * (it would become part of them), nor inside a heading.
 */

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui';
import { placeTip, type Side } from './place-tip';

type Mode =
  | {
      /** The explanation: plain text, about three sentences at most. */
      children: ReactNode;
      onOpen?: never;
    }
  | {
      /** Opens the sheet that holds a longer explanation. */
      onOpen: () => void;
      children?: never;
    };

export type InfoTipProps = Mode & {
  /** Names the subject — "More on Load the bar", "What DOTS is". Never "About …". */
  label: string;
  /** `inverse` on a filled, selected row, where the muted colour would vanish. */
  tone?: 'default' | 'inverse';
  className?: string;
  /**
   * The id of the element holding the text, for a control that should also be
   * described by it — a switch whose hint moved behind the ⓘ keeps the hint as
   * its description. The text, not the tip: the tip is named after the ⓘ, and a
   * description read from it would be that name.
   */
  textId?: string;
};

export function InfoTip(props: InfoTipProps) {
  const { label, tone = 'default', className } = props;
  const own = useId();
  const btnId = `${own}-info`;
  const tipId = `${own}-tip`;
  const textId = props.textId ?? `${own}-text`;
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const isSheet = 'onOpen' in props && typeof props.onOpen === 'function';

  /** Where the tip goes, written straight onto it. */
  const position = useEffectEvent((keep?: Side) => {
    const el = tip.current;
    const anchor = btn.current;
    if (!el || !anchor) return;
    const p = placeTip(
      anchor.getBoundingClientRect(),
      { width: window.innerWidth, height: window.innerHeight },
      safeArea(),
      keep,
    );
    el.dataset.side = p.side;
    el.style.left = `${p.left}px`;
    el.style.width = `${p.width}px`;
    el.style.top = p.top === null ? 'auto' : `${p.top}px`;
    el.style.bottom = p.bottom === null ? 'auto' : `${p.bottom}px`;
    el.style.transformOrigin = `${p.caretX}px ${p.side === 'below' ? '0' : '100%'}`;
    const body = el.lastElementChild as HTMLElement | null;
    if (body) body.style.maxHeight = `${p.maxHeight}px`;
    if (caret.current) caret.current.style.left = `${p.caretX - 5}px`;
  });

  /*
   * Everything a tip does while open, attached as it opens and taken off as it
   * closes — in `beforetoggle`, which fires synchronously, so there is no gap
   * between the tip appearing and Escape or an outside tap closing it. It is
   * also where the tip is placed: before its first frame, and written straight
   * onto the element, because a render would land after the first paint.
   */
  useEffect(() => {
    const el = tip.current;
    const anchor = btn.current;
    if (!el || !anchor || isSheet) return;

    const close = () => hide(el);
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !el.contains(target) && !anchor.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    let frame = 0;
    const follow = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = anchor.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) close();
        else position(el.dataset.side as Side | undefined);
      });
    };
    const listen = (on: boolean) => {
      if (on) {
        document.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', follow, { capture: true, passive: true });
        window.addEventListener('resize', follow);
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        document.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', follow, { capture: true });
        window.removeEventListener('resize', follow);
      }
    };

    const before = (e: Event) => {
      const opening = (e as ToggleEvent).newState === 'open';
      if (opening) position();
      listen(opening);
    };
    const toggled = (e: Event) => setOpen((e as ToggleEvent).newState === 'open');
    el.addEventListener('beforetoggle', before);
    el.addEventListener('toggle', toggled);
    return () => {
      el.removeEventListener('beforetoggle', before);
      el.removeEventListener('toggle', toggled);
      listen(false);
    };
  }, [isSheet]);

  const mark = (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      {/* A filled disc with the "i" cut out of it, so it reads on any
          background — the outlined "i" belongs to the exercise names. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 .75a7.25 7.25 0 1 0 0 14.5A7.25 7.25 0 1 0 8 .75zM8 3.6a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 1 0 0-2.3zM7.05 7.85a.95.95 0 0 1 1.9 0v3.3a.95.95 0 0 1-1.9 0z"
      />
    </svg>
  );

  const buttonClass = cn(
    'press-deep relative inline-grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-full align-middle',
    // A 44 px target around a 24 px mark, without taking the room.
    "touch-manipulation before:absolute before:-inset-2.5 before:content-['']",
    // The global focus ring rounds to 10 px; a round mark wants a round ring.
    'focus-visible:rounded-full!',
    tone === 'inverse'
      ? 'text-current opacity-75 hover:opacity-100'
      : open
        ? 'bg-[var(--color-accent-2-bg)] text-[var(--color-accent-2)]'
        : 'text-[var(--color-muted)] hover:bg-[var(--color-accent-2-bg)] hover:text-[var(--color-accent-2)]',
    className,
  );

  if (isSheet) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={props.onOpen}
        className={buttonClass}
      >
        {mark}
      </button>
    );
  }

  return (
    <>
      <button
        ref={btn}
        id={btnId}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        aria-describedby={textId}
        popoverTarget={tipId}
        className={buttonClass}
      >
        {mark}
      </button>
      <span
        ref={tip}
        id={tipId}
        popover="auto"
        role="note"
        aria-labelledby={btnId}
        className={cn(
          // Undo the browser's centred popover; `position` sets the rest.
          'group/tip fixed inset-auto m-0 overflow-visible p-0',
          'rounded-[12px] border border-[var(--color-line)] bg-[var(--color-surface-3)] shadow-[var(--shadow-card)]',
          // Whatever the row it sits in says about text, the tip is plain.
          'text-left text-[13px] leading-[1.45] font-normal tracking-normal whitespace-normal text-[var(--color-ink)] normal-case',
          '[&:popover-open]:animate-[pop_var(--dur-fast)_var(--ease-out)_both]',
        )}
      >
        <span
          ref={caret}
          aria-hidden
          className={cn(
            'absolute h-2.5 w-2.5 rotate-45 border-[var(--color-line)] bg-[var(--color-surface-3)]',
            'group-data-[side=below]/tip:-top-[6px] group-data-[side=below]/tip:border-t group-data-[side=below]/tip:border-l',
            'group-data-[side=above]/tip:-bottom-[6px] group-data-[side=above]/tip:border-r group-data-[side=above]/tip:border-b',
          )}
        />
        <span id={textId} className="block overflow-y-auto overscroll-contain px-3 py-2.5">
          {props.children}
        </span>
      </span>
    </>
  );
}

/** Closes a tip if it is open. Older engines throw on a tip already closed. */
function hide(el: HTMLElement) {
  try {
    if (el.matches(':popover-open')) el.hidePopover();
  } catch {
    /* No Popover API: nothing was ever shown as one. */
  }
}

/** The notch and home bar, from the variables `globals.css` sets to `env()`. */
function safeArea(): { top: number; bottom: number } {
  const s = getComputedStyle(document.documentElement);
  return {
    top: parseFloat(s.getPropertyValue('--safe-top')) || 0,
    bottom: parseFloat(s.getPropertyValue('--safe-bottom')) || 0,
  };
}
