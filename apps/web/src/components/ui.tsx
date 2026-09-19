'use client';

import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/lib/client/hooks';

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
              <span aria-hidden className="text-[var(--color-accent)]">
                ✓
              </span>
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
  const tr = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Only ever opened from a tap, so there is no server render to guard.
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      /* `100dvh`, not `inset-0`. A fixed overlay sized to the *layout* viewport
         runs underneath a phone's address bar, which is exactly how the last
         line of a sheet ends up cut in half by the bottom of the screen. */
      className="animate-fade fixed inset-0 z-50 flex h-[100dvh] items-end justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* A column rather than one scrolling box: the handle and the title stay
          put while the content moves under them, so a long sheet still shows
          what it is and how to close it. Capped short of the full height so
          there is always a strip of the page behind it — a sheet that fills
          the screen is a page, and people stop expecting it to dismiss. */}
      <div className="animate-sheet flex max-h-[86dvh] w-full max-w-[560px] flex-col rounded-t-[20px] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
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
            against the screen edge with no air under it. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.75rem)]">
          {children}
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
