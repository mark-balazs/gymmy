'use client';

/**
 * gymmy's own number pad, so setting a number on Train never opens the phone's
 * keyboard.
 *
 * The keyboard was the thing being replaced. It takes half the screen, the
 * browser scrolls the page to keep the focused box above it, and the card you
 * were reading jumps — between sets, with a phone you keep putting down. This
 * sheet covers the same half of the screen without moving anything under it.
 *
 * **No `<input>` anywhere.** `inputmode="none"` is the documented way to ask for
 * a field without a keyboard, and iOS does not reliably honour it, so the typed
 * number lives in state and is shown in an `<output>`. Every key is a real
 * `<button>`, which is what makes it work with a screen reader and a switch, and
 * a hardware keyboard's digits are accepted too.
 *
 * **Portalled to the body.** It opens from inside a card, and a card that is
 * faded (`opacity-70` once its sets are done) or transformed becomes the
 * containing block for a `position: fixed` child — "cover the screen" would
 * quietly become "cover the card". The lightbox is portalled for the same
 * reason.
 */

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buttonClass } from '@/components/ui';
import { useT } from '@/lib/client/hooks';

/** Two decimal places at most and no trailing zeros — 61.25, 60, 7. The
 *  resolution every number on the card is kept at, written the way the rest of
 *  the app writes a weight. */
export const formatAmount = (n: number): string => String(Math.round(n * 100) / 100);

/** Four digits before the point reaches past anything `logSet` will store, and
 *  two after it is a 1.25 kg plate. Past either, a key press is ignored rather
 *  than producing a number nobody meant. */
const MAX_WHOLE = 4;
const MAX_FRACTION = 2;

/** What the typed text becomes after one key. Pure, so the rules — no leading
 *  zeros, one point, no point at all for reps — are in one place. */
function nextTyped(typed: string, key: string, decimals: boolean): string {
  if (key === 'back') return typed.slice(0, -1);
  if (key === '.') {
    if (!decimals || typed.includes('.')) return typed;
    return `${typed === '' ? '0' : typed}.`;
  }
  const [whole = '', fraction] = typed.split('.');
  if (fraction !== undefined) return fraction.length >= MAX_FRACTION ? typed : typed + key;
  // "07" is a 7 somebody fumbled, not a different number.
  if (whole === '0') return key;
  return whole.length >= MAX_WHOLE ? typed : typed + key;
}

export interface KeypadProps {
  open: boolean;
  /** What is being typed — "Weight", "Reps". The dialog's name, and shown. */
  title: string;
  /** Shown after the number; empty for reps. */
  unit: string;
  /** The number on the card now. Shown faded until the first key, so Done
   *  with nothing typed leaves it exactly as it was. */
  value: number | null;
  /** Whether the point key works. Off for reps: nobody does half a rep, and a
   *  key that cannot be pressed is clearer than one that is ignored. */
  decimals: boolean;
  /** Called with the typed number, then `onClose` — the caller only has to
   *  store the value. Not called at all when nothing was typed. */
  onDone: (v: number) => void;
  /** Cancel, Escape, a tap on the backdrop, and after Done. */
  onClose: () => void;
  /**
   * Where focus goes back to on close.
   *
   * Passed rather than read from `document.activeElement` because Safari does
   * not focus a button when it is tapped, so on an iPhone the active element at
   * open is the page body — and focus would land at the top of the document,
   * nowhere near the card.
   */
  opener?: HTMLElement | null;
}

export function Keypad(props: KeypadProps) {
  // Only ever opened from a tap, so there is no server render to guard; the
  // check keeps an eager caller from taking the page down.
  if (!props.open || typeof document === 'undefined') return null;
  // Mounted per opening, so what was typed last time never leaks into this one.
  return createPortal(<Sheet {...props} />, document.body);
}

function Sheet({ title, unit, value, decimals, onDone, onClose, opener }: KeypadProps) {
  const tr = useT();
  const titleId = useId();
  const [typed, setTyped] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  const press = (key: string) => setTyped((t) => nextTyped(t, key, decimals));

  const finish = () => {
    if (typed !== '') {
      const v = Number(typed);
      if (Number.isFinite(v)) onDone(Math.round(v * 100) / 100);
    }
    onClose();
  };

  /* Focus moves in on open and back out on close — a modal that leaves focus
     behind it has a keyboard or screen-reader user typing into a page they can
     no longer see. Done, not the first digit: it is the one key that means
     the same thing whatever was typed. */
  useEffect(() => {
    const back =
      opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    done.current?.focus();
    return () => back?.focus({ preventScroll: true });
  }, [opener]);

  /**
   * Keys from a hardware keyboard, and the focus trap.
   *
   * On `window` in the capture phase, and stopped once handled: Escape here
   * must close the keypad and nothing else, and the sheets and the lightbox
   * listen on `document` — a window capture listener runs before all of them.
   *
   * Enter means Done wherever focus is, except on Cancel, because Enter after
   * typing a number is "that one" — but a keyboard user who tabbed to Cancel
   * meant Cancel.
   */
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Tab') {
      const box = panel.current;
      if (!box) return;
      const keys = [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = keys[0];
      const last = keys[keys.length - 1];
      const active = document.activeElement;
      if (!box.contains(active) || (e.shiftKey ? active === first : active === last)) {
        e.preventDefault();
        (box.contains(active) && e.shiftKey ? last : first)?.focus();
      }
      return;
    }
    if (/^[0-9]$/.test(e.key)) press(e.key);
    // A comma too: it is the decimal key on most of Europe's keyboards.
    else if (e.key === '.' || e.key === ',') press('.');
    else if (e.key === 'Backspace' || e.key === 'Delete') press('back');
    else if (e.key === 'Enter') {
      if (document.activeElement === cancel.current) onClose();
      else finish();
    } else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener, { capture: true });
    return () => window.removeEventListener('keydown', listener, { capture: true });
  }, []);

  const keyClass =
    'num min-h-[56px] cursor-pointer rounded-[12px] bg-[var(--color-surface-2)] text-[22px] font-semibold ' +
    'transition-[transform,background-color,opacity] duration-100 active:scale-[0.96] active:bg-[var(--color-surface-3)] ' +
    'disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100';

  return (
    <div
      /* `100dvh` for the same reason the sheets use it: sized to the layout
         viewport, a fixed overlay runs under a phone's address bar.
         `touch-none` because nothing here scrolls, and a drag on the backdrop
         should not move the page behind it. */
      className="animate-fade fixed inset-0 z-[60] flex h-[100dvh] touch-none items-end justify-center bg-black/60 backdrop-blur-[2px]"
      // A sideways drag across the keys must not also change tab.
      data-no-swipe
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet flex w-full max-w-[480px] flex-col gap-3 rounded-t-[20px] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Not a heading: this sits over Train, whose tests and screen-reader
              users both read the page's headings as its list of exercises. */}
          <span id={titleId} className="min-w-0 flex-1 truncate text-[17px] font-semibold">
            {title}
          </span>
          <button
            ref={cancel}
            type="button"
            onClick={onClose}
            className={buttonClass('ghost', '-mr-2 shrink-0 px-3')}
          >
            {tr.t('entry.cancel')}
          </button>
        </div>

        {/* Announced as it changes, so a screen reader hears each digit land. */}
        <output
          aria-live="polite"
          className="num flex min-h-[60px] items-baseline justify-center gap-1.5 text-[44px] leading-[60px] font-bold tracking-tight"
        >
          {typed === '' ? (
            // The number it will stay if nothing is typed — faded, so it reads
            // as where you are rather than as something already entered.
            <span className="opacity-35">{value === null ? '0' : formatAmount(value)}</span>
          ) : (
            <span>{typed}</span>
          )}
          {unit && (
            <span className="text-base font-semibold text-[var(--color-muted)]">{unit}</span>
          )}
        </output>

        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className={keyClass} onClick={() => press(d)}>
              {d}
            </button>
          ))}
          <button
            type="button"
            className={keyClass}
            disabled={!decimals}
            onClick={() => press('.')}
          >
            .
          </button>
          <button type="button" className={keyClass} onClick={() => press('0')}>
            0
          </button>
          <button
            type="button"
            className={keyClass}
            aria-label={tr.t('entry.delete')}
            onClick={() => press('back')}
          >
            <span aria-hidden>⌫</span>
          </button>
          <button
            ref={done}
            type="button"
            onClick={finish}
            className={buttonClass('primary', 'col-span-3 min-h-[52px] text-[17px]')}
          >
            {tr.t('entry.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
