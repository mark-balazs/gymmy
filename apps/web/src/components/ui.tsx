'use client';

import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Presence, PresenceBoundary, usePresence } from '@/components/presence';
import { dragToDismiss, leave } from '@/components/sheet-gesture';
import { useT } from '@/lib/client/hooks';
import { Tick } from '@/components/tick';

export const cn = clsx;

export function Card({
  className,
  children,
  ref,
}: {
  className?: string;
  children: ReactNode;
  /** For a card that has to be scrolled to — Train brings the next exercise
   *  into view once it has opened. */
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4',
        'shadow-[var(--shadow-card)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

/** Shared so a link can look like a button without a second copy of the
 *  styling — a navigation should stay an anchor rather than become a button
 *  with an onClick, which loses middle-click, long-press and prefetching. */
export const buttonClass = (variant: Variant = 'default', className?: string): string =>
  cn(
    'inline-flex min-h-[var(--spacing-tap)] cursor-pointer items-center justify-center gap-2',
    'press rounded-[12px] border px-4 font-semibold',
    'disabled:cursor-not-allowed disabled:opacity-40',
    variant === 'primary' &&
      'border-transparent bg-[image:var(--gradient-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-accent)]',
    variant === 'default' &&
      'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink)] hover:bg-[var(--color-surface-3)]',
    variant === 'ghost' &&
      'border-transparent bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]',
    variant === 'danger' && 'border-transparent bg-transparent text-[var(--color-bad)]',
    className,
  );

export function Button({
  variant = 'default',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button {...rest} className={buttonClass(variant, className)}>
      {children}
    </button>
  );
}

export function Chip({
  tone = 'default',
  children,
}: {
  /** `info` is the second voice — identity labels like the kind of day this is,
   *  which are neither a status nor a thing you did. */
  tone?: 'default' | 'ok' | 'bad' | 'warn' | 'info';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'default' && 'border border-[var(--color-line)] bg-[var(--color-surface-2)]',
        tone === 'ok' && 'bg-[var(--color-good-bg)] text-[var(--color-accent)]',
        tone === 'bad' && 'bg-[var(--color-bad-bg)] text-[var(--color-bad)]',
        tone === 'warn' && 'text-[var(--color-warn)]',
        tone === 'info' && 'bg-[var(--color-accent-2-bg)] text-[var(--color-accent-2)]',
      )}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

/** Segmented control. Big targets — this gets used mid-set with one hand. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  doneLabel,
}: {
  value: T;
  options: {
    value: T;
    label: string;
    /** Finished. Ticked and recessed, so a glance says which are left. */
    done?: boolean;
    /** Finished just now, by something done on this screen: the tick draws
     *  itself instead of simply being there. */
    justDone?: boolean;
  }[];
  onChange: (v: T) => void;
  /** The word a screen reader hears for a ticked option; the tick is decorative. */
  doneLabel?: string;
}) {
  return (
    <div className="flex gap-1.5 rounded-xl bg-[var(--color-surface-2)] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-[38px] flex-1 cursor-pointer rounded-[10px] text-sm font-semibold',
            'press',
            'inline-flex items-center justify-center gap-1',
            o.value === value
              ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[var(--shadow-card)]'
              : o.done
                ? // Finished and not selected: recede. The point of ticking days
                  // off is that the unfinished ones are what stands out.
                  'text-[var(--color-muted)]/70 hover:text-[var(--color-ink)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]',
          )}
        >
          {o.label}
          {o.done && (
            <>
              {/* Never colour alone: the tick is the signal and the fade is
                  only reinforcement, because a muted label and a normal one are
                  the same label to plenty of people. */}
              <Tick draw={o.justDone} className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              {doneLabel && <span className="sr-only">{doneLabel}</span>}
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Bottom sheet — reachable with a thumb, unlike a centred modal.
 *
 * **Portalled to the body.** Sheets open from inside cards, and a card that is
 * faded (a finished exercise on Train) or transformed passes that on: the
 * sheet showed at the card's 70% opacity (GYM-24), and a transformed parent
 * turns "cover the screen" into "cover the card". The keypad and the lightbox
 * are portalled for the same reason. It also takes the sheet out of any
 * `<form>` it is declared in, so its buttons can never submit that form.
 *
 * **It leaves as it came** (GYM-17): it stays on screen until its exit has
 * played — `open` turning false, or, for a sheet its caller mounts with
 * `{x && <Sheet open …>}`, a `<Presence>` around that condition. While it
 * leaves it is `inert` and hidden from assistive technology, so the page
 * behind takes taps at once and a test looking for "the dialog" does not find
 * the one on its way out. A caller that mounts a sheet conditionally without
 * a `<Presence>` gets no exit.
 *
 * **Drag it down to dismiss** (`sheet-gesture.ts` has the rules): from
 * anywhere on it, as long as what is under the finger is scrolled to the top.
 *
 * **Focus** moves into it as it opens and goes back to whatever had it as it
 * closes, so a keyboard or screen-reader user is never left in a page they
 * cannot see.
 */
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  /* Two things can end it: `open`, and a `<Presence>` its caller put around
     it. Either way it is this component's own `<Presence>` that keeps the
     panel through the exit, and tells the caller's one when it is over. */
  const outer = usePresence();
  // Only ever opened from a tap, so there is no server render to guard.
  const shown = open && outer.present && typeof document !== 'undefined';
  return (
    <Presence onExit={outer.done}>
      {shown && (
        <SheetPanel title={title} onClose={onClose}>
          {children}
        </SheetPanel>
      )}
    </Presence>
  );
}

function SheetPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const tr = useT();
  const { present, done } = usePresence();
  const dialog = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** The finger's speed when a drag let it go: the exit carries on at it. */
  const fling = useRef<number | null>(null);

  const close = useEffectEvent(() => onClose());
  const dismiss = useEffectEvent((velocity: number) => {
    fling.current = velocity;
    onClose();
  });

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [present]);

  /* In as it opens, back as it closes — to whatever had focus, which is the
     button that opened it. Only if focus is still in the sheet (or nowhere):
     an action that moved it on purpose keeps it where it went. */
  useEffect(() => {
    if (!present) return;
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const box = dialog.current;
    if (box && !box.contains(active)) box.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      const lost = !now || now === document.body || (box?.contains(now) ?? false);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [present]);

  useEffect(() => {
    const p = panel.current;
    const s = shade.current;
    if (!present || !p || !s) return;
    return dragToDismiss(p, s, (v) => dismiss(v));
  }, [present]);

  /* The exit, started before the frame that would show the sheet without it,
     from wherever the sheet is — a drag included. */
  useLayoutEffect(() => {
    const p = panel.current;
    const s = shade.current;
    if (present || !p || !s) return;
    let current = true;
    // Gone once it has played — or been cut short: never left on screen, inert.
    const end = () => current && done();
    leave(p, s, fling.current).finished.then(end, end);
    return () => {
      current = false;
    };
  }, [present, done]);

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={present ? undefined : true}
      inert={!present}
      tabIndex={-1}
      data-sheet
      data-state={present ? 'open' : 'closed'}
      // A sideways drag on a sheet — a chart, a row of chips — must not
      // change the tab behind it and throw the sheet away.
      data-no-swipe
      /* `100dvh`, not `inset-0`. A fixed overlay sized to the *layout* viewport
         runs underneath a phone's address bar, which is exactly how the last
         line of a sheet ends up cut in half by the bottom of the screen. */
      className={cn(
        'fixed inset-0 z-50 flex h-[100dvh] items-end justify-center outline-none',
        !present && 'pointer-events-none',
      )}
    >
      {/* The dimmed page, its own layer so a drag can lighten it without
          fading the sheet. */}
      <div
        ref={shade}
        aria-hidden
        className="animate-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* A column rather than one scrolling box: the handle and the title stay
          put while the content moves under them, so a long sheet still shows
          what it is and how to close it. Capped short of the full height so
          there is always a strip of the page behind it — a sheet that fills
          the screen is a page, and people stop expecting it to dismiss. The
          `after:` strip carries its surface on below the bottom edge, so a
          sheet pulled up past where it rests does not lift off the screen. */}
      <div
        ref={panel}
        className="animate-sheet relative flex max-h-[86dvh] w-full max-w-[560px] flex-col rounded-t-[20px] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] after:absolute after:-inset-x-px after:top-full after:h-[50dvh] after:border-x after:border-[var(--color-line)] after:bg-[var(--color-surface)] after:content-['']"
      >
        <div className="shrink-0 px-4 pt-3">
          <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[var(--color-line)]" />
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 flex-1 text-[17px] font-semibold">{title}</h2>
            <Button
              type="button"
              variant="ghost"
              className="-mr-1 min-h-9 shrink-0 px-2"
              aria-label={tr.t('common.close')}
              onClick={onClose}
            >
              ✕
            </Button>
          </div>
        </div>
        {/* The padding at the end is what stops the last row sitting flush
            against the screen edge with no air under it. Contained, so a
            scroll that reaches the end stops there instead of moving the page
            behind. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto overscroll-contain px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]">
          {/* A sheet opened from inside this one answers to its own presence. */}
          <PresenceBoundary>{children}</PresenceBoundary>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Summary({
  tone,
  children,
}: {
  tone: 'good' | 'near' | 'gap' | 'idle';
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        'rounded-[11px] px-3 py-2.5 text-[13.5px] font-semibold',
        tone === 'good' && 'bg-[var(--color-good-bg)] text-[var(--color-accent)]',
        tone === 'gap' && 'bg-[var(--color-bad-bg)] text-[var(--color-bad)]',
        (tone === 'near' || tone === 'idle') &&
          'bg-[var(--color-surface-2)] text-[var(--color-ink)]',
      )}
    >
      {children}
    </p>
  );
}
