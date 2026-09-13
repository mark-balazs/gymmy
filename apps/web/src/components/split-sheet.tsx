'use client';

import { Sheet } from '@/components/ui';
import { useT } from '@/lib/client/hooks';
import type { Key } from '@/lib/i18n';
import { findSplit, sessionLabel, type SplitKey } from '@athletic/domain';

/**
 * What a split actually commits you to.
 *
 * Choosing one is a real decision — it decides how the week is shaped and, with
 * it, what the app will call a complete week — and a one-line hint is not enough
 * to make it on. Every concrete claim here is read off the preset itself rather
 * than written out a second time in prose, so the explanation cannot drift from
 * the split it is explaining.
 */
export function SplitSheet({ split, onClose }: { split: SplitKey; onClose: () => void }) {
  const tr = useT();
  const preset = findSplit(split);
  if (!preset) return null;

  // One day template means every session is the same shape — a full-body week.
  // Labelling those "Day 1, Day 2, Day 3" would imply a difference there isn't.
  const shared = preset.days.length === 1;

  return (
    <Sheet title={tr.t('split.about', { split: tr.split(split) })} open onClose={onClose}>
      <p className="text-sm leading-relaxed">{tr.t(`split.${split}Why` as Key)}</p>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {tr.t('split.shape')}
        </h3>

        {preset.days.map((day, i) => (
          <div
            key={day.key}
            className="rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{tr.day(day.key)}</span>
              <span className="text-[11px] text-[var(--color-muted)]">
                {shared ? tr.t('split.everyDay') : tr.t('common.day', { n: sessionLabel(i) })}
              </span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {day.slots.map((slot, j) => (
                <li
                  key={`${slot.key}-${j}`}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="min-w-0 truncate">{tr.t(`slot.${slot.key}` as Key)}</span>
                  <span className="shrink-0 text-[var(--color-muted)]">
                    {/* The same precedence `buildSlots` applies: a pattern list
                        is narrower than a role, so it wins where both exist. */}
                    {tr.holds({
                      requiredRole: slot.patterns ? 'Any' : (slot.role ?? 'Any'),
                      patternKeys: slot.patterns ?? null,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="text-xs text-[var(--color-muted)]">
          {tr.t('split.range', { min: preset.minDays, max: preset.maxDays })}
          {preset.maxDays > preset.days.length && ` ${tr.t('split.repeats')}`}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-[var(--color-muted)] uppercase">
          {tr.t('split.complete')}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {preset.covers.map((key) => (
            <span
              key={key}
              className="rounded-full bg-[var(--color-good-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]"
            >
              {tr.t(`pattern.${key}` as Key)}
            </span>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted)]">{tr.t('split.completeBody')}</p>
      </section>
    </Sheet>
  );
}
