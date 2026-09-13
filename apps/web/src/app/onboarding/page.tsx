'use client';

/**
 * Four questions, then a finished program.
 *
 * The split is asked first because it constrains the rest: push/pull/legs
 * cannot cover a week in two days, so the day options are derived from the
 * chosen split rather than offered and then rejected.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, InfoButton, Segmented, cn } from '@/components/ui';
import { SplitSheet } from '@/components/split-sheet';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { applySplit, fireAndForget, patchProfile, setLang } from '@/lib/client/mutations';
import { startSync } from '@/lib/client/sync';
import { LANGS } from '@/lib/i18n';
import type { Key } from '@/lib/i18n';
import {
  allowedDays,
  buildProgram,
  buildSlots,
  BIASES,
  findSplit,
  index,
  mondayOf,
  programCoverage,
  SPLITS,
  type Bias,
  type SplitKey,
  type Where,
} from '@athletic/domain';

const STEPS = 4;

/** Defined at module scope: a component declared inside render is a brand-new
 *  type on every keystroke, so React would unmount and remount the list below it. */
const Option = ({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    aria-label={hint ? `${label}. ${hint}` : label}
    onClick={onClick}
    className={cn(
      'flex min-h-[62px] w-full items-center justify-between gap-3 rounded-[11px] border px-3.5 py-3 text-left',
      disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      selected
        ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
        : 'border-[var(--color-line)] bg-[var(--color-surface-2)]',
    )}
  >
    <span>
      <span className="block font-semibold">{label}</span>
      {hint && (
        <span
          className={cn('block text-xs', selected ? 'opacity-75' : 'text-[var(--color-muted)]')}
        >
          {hint}
        </span>
      )}
    </span>
    <span aria-hidden>›</span>
  </button>
);

const Back = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button variant="ghost" className="self-start" onClick={onClick}>
    ‹ {label}
  </Button>
);

export default function Onboarding() {
  const { snap } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [split, setSplit] = useState<Exclude<SplitKey, 'custom'>>('sevenPattern');
  const [days, setDays] = useState(3);
  const [where, setWhere] = useState<Where>('gym');
  const [bias, setBias] = useState<Bias>('none');
  const [info, setInfo] = useState<SplitKey | null>(null);

  // A brand-new account arrives before its first sync, so this page starts the
  // engine itself rather than relying on the app shell below it.
  useEffect(() => {
    startSync();
  }, []);

  const dayOptions = useMemo(() => allowedDays(split), [split]);

  const preview = useMemo(() => {
    if (step !== STEPS) return null;
    const preset = findSplit(split);
    if (!preset) return null;

    const stamp = new Date().toISOString();
    const slots = buildSlots(preset, days).map((s, i) => ({
      ...s,
      id: `preview-slot-${i}`,
      updatedAt: stamp,
      deletedAt: null,
    }));

    // Preview the split being chosen, including what it counts as complete —
    // otherwise the account's existing period would score this week against the
    // split the user is in the middle of leaving.
    const splitPeriods = [
      {
        id: 'preview-period',
        updatedAt: stamp,
        deletedAt: null,
        split: preset.key,
        days,
        startWeek: mondayOf(new Date()),
        patternKeys: [...preset.covers],
      },
    ];

    const previewIx = index({ ...snap, slots, splitPeriods, entries: [] });
    const draft = buildProgram(previewIx, { days, where, bias });

    const withEntries = index({
      ...snap,
      slots,
      splitPeriods,
      entries: draft.map((d, i) => ({
        ...d,
        id: `preview-${i}`,
        updatedAt: stamp,
        deletedAt: null,
      })),
    });

    return {
      ix: withEntries,
      draft,
      slots,
      covered: programCoverage(withEntries, days).every((c) => c.sets > 0),
    };
  }, [step, snap, split, days, where, bias]);

  if (!profile) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-[var(--color-muted)]">{tr.t('common.loading')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[460px] flex-col justify-center gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 w-6 rounded-full',
                i <= step ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]',
              )}
            />
          ))}
        </div>
        {step === 0 && (
          <div className="w-[170px]">
            <Segmented
              value={tr.lang}
              onChange={(v) => fireAndForget(setLang(v))}
              options={LANGS.map((l) => ({ value: l.id, label: l.label }))}
            />
          </div>
        )}
      </div>

      {step === 0 && (
        <>
          <div>
            <h1 className="text-[26px] leading-tight font-bold">{tr.t('onboard.q0.title')}</h1>
            <p className="mt-1.5 text-[var(--color-muted)]">{tr.t('onboard.q0.sub')}</p>
          </div>
          {/* The info button is a sibling rather than something inside the
              option: nesting a button in a button is neither valid markup nor
              reachable with a keyboard, and this is the first screen where
              somebody has to choose a split having never seen one. */}
          {SPLITS.map((s) => (
            <div key={s.key} className="flex items-stretch gap-1.5">
              <div className="min-w-0 flex-1">
                <Option
                  label={tr.split(s.key)}
                  hint={tr.t(`split.${s.key}H` as Key)}
                  selected={split === s.key}
                  onClick={() => {
                    setSplit(s.key);
                    // Clamp the day count into what this split can cover.
                    setDays((d) => (allowedDays(s.key).includes(d) ? d : s.defaultDays));
                    setStep(1);
                  }}
                />
              </div>
              <InfoButton
                label={tr.t('split.info', { split: tr.split(s.key) })}
                onClick={() => setInfo(s.key)}
                className="rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)]"
              />
            </div>
          ))}
        </>
      )}

      {step === 1 && (
        <>
          <div>
            <h1 className="text-[26px] leading-tight font-bold">{tr.t('onboard.q1.title')}</h1>
            <p className="mt-1.5 text-[var(--color-muted)]">{tr.t('onboard.q1.sub')}</p>
          </div>
          {dayOptions.map((n) => (
            <Option
              key={n}
              label={tr.t('sub.daysPerWeek', { n })}
              hint={n <= 4 ? tr.t(`onboard.days.${n}h` as Key) : undefined}
              selected={days === n}
              onClick={() => {
                setDays(n);
                setStep(2);
              }}
            />
          ))}
          <Back label={tr.t('common.back')} onClick={() => setStep(0)} />
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <h1 className="text-[26px] leading-tight font-bold">{tr.t('onboard.q2.title')}</h1>
            <p className="mt-1.5 text-[var(--color-muted)]">{tr.t('onboard.q2.sub')}</p>
          </div>
          {(['gym', 'home'] as const).map((w) => (
            <Option
              key={w}
              label={tr.t(`onboard.where.${w}` as Key)}
              hint={tr.t(`onboard.where.${w}h` as Key)}
              selected={where === w}
              onClick={() => {
                setWhere(w);
                setStep(3);
              }}
            />
          ))}
          <Back label={tr.t('common.back')} onClick={() => setStep(1)} />
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <h1 className="text-[26px] leading-tight font-bold">{tr.t('onboard.q3.title')}</h1>
            <p className="mt-1.5 text-[var(--color-muted)]">{tr.t('onboard.q3.sub')}</p>
          </div>
          {BIASES.map((b) => (
            <Option
              key={b}
              label={tr.t(`bias.${b}` as Key)}
              selected={bias === b}
              onClick={() => {
                setBias(b);
                setStep(STEPS);
              }}
            />
          ))}
          <Back label={tr.t('common.back')} onClick={() => setStep(2)} />
        </>
      )}

      {step === STEPS && preview && (
        <>
          <div>
            <h1 className="text-[26px] leading-tight font-bold">{tr.t('onboard.done.title')}</h1>
            <p className="mt-1.5 text-[var(--color-muted)]">{tr.t('onboard.done.sub')}</p>
          </div>

          {Array.from({ length: days }, (_, d) => {
            const dayKey = preview.slots.find((s) => s.sessionIndex === d)?.dayKey ?? null;
            return (
              <Card key={d}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{tr.t('common.day', { n: d + 1 })}</h3>
                  <span className="text-xs text-[var(--color-muted)]">{tr.day(dayKey)}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {preview.draft
                    .filter((x) => x.sessionIndex === d && x.exerciseId)
                    .map((x) => (
                      <div key={x.slotId} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
                        <span className="truncate text-sm">
                          {preview.ix.exerciseById.get(x.exerciseId!)?.name ?? ''}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })}

          <Button
            variant="primary"
            onClick={async () => {
              await applySplit(snap, { split, days, where, bias });
              await patchProfile({ onboarded: true });
              router.replace('/train');
            }}
          >
            {tr.t('onboard.start')}
          </Button>
          <Button variant="ghost" onClick={() => setStep(0)}>
            {tr.t('onboard.change')}
          </Button>
        </>
      )}

      {info && <SplitSheet split={info} onClose={() => setInfo(null)} />}
    </main>
  );
}
