'use client';

import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect } from 'react';

export const cn = clsx;

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

export function Button({
  variant = 'default',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex min-h-[var(--spacing-tap)] cursor-pointer items-center justify-center gap-2',
        'rounded-[11px] border px-4 font-semibold transition-transform active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' &&
          'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]',
        variant === 'default' &&
          'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink)]',
        variant === 'ghost' && 'border-transparent bg-transparent text-[var(--color-ink)]',
        variant === 'danger' && 'border-transparent bg-transparent text-[var(--color-bad)]',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'ok' | 'bad' | 'warn';
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
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
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
            'min-h-[38px] flex-1 cursor-pointer rounded-[9px] text-sm font-semibold',
            o.value === value
              ? 'bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
              : 'text-[var(--color-muted)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
}) {
  const bump = (d: number) => {
    const next = Math.min(max, Math.max(min, Math.round(((value ?? 0) + d * step) * 100) / 100));
    onChange(next);
  };
  return (
    <div className="grid grid-cols-[var(--spacing-tap)_1fr_var(--spacing-tap)] items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label} −`}
        onClick={() => bump(-1)}
        className="h-[var(--spacing-tap)] cursor-pointer rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] text-xl font-semibold"
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="num min-h-[var(--spacing-tap)] w-full min-w-0 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] text-center text-[17px] font-semibold"
      />
      <button
        type="button"
        aria-label={`${label} +`}
        onClick={() => bump(1)}
        className="h-[var(--spacing-tap)] cursor-pointer rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] text-xl font-semibold"
      >
        +
      </button>
    </div>
  );
}

/** Bottom sheet — reachable with a thumb, unlike a centred modal. */
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/55"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="animate-sheet safe-bottom max-h-[92vh] w-full overflow-auto rounded-t-[18px] border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 pt-4 pb-5">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-[var(--color-line)]" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <Button variant="ghost" className="min-h-9 px-2" aria-label="Close" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
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
