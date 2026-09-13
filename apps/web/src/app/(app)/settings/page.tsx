'use client';

import { useState } from 'react';
import { Button, Card, Field, Segmented, Sheet, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { applySplit, fireAndForget, setLang, setTheme, setUnit } from '@/lib/client/mutations';
import { sync, wipeLocal } from '@/lib/client/sync';
import { signOutAction } from './actions';
import { LANGS } from '@/lib/i18n';
import type { Key } from '@/lib/i18n';
import {
  allowedDays,
  BIASES,
  DEFAULT_PREFS,
  findSplit,
  SPLITS,
  type Bias,
  type Profile,
  type SplitKey,
  type Theme,
  type Where,
} from '@athletic/domain';

interface Draft {
  split: SplitKey;
  days: number;
  where: Where;
  bias: Bias;
}

const draftOf = (p: Profile | null): Draft => ({
  split: p?.split ?? DEFAULT_PREFS.split,
  days: p?.days ?? DEFAULT_PREFS.days,
  where: p?.where ?? DEFAULT_PREFS.where,
  bias: p?.bias ?? DEFAULT_PREFS.bias,
});

const SPLIT_OPTIONS: SplitKey[] = SPLITS.map((s) => s.key);

/** Compared rather than by object identity: `useLiveQuery` hands back a fresh
 *  object on every IndexedDB write, including ones that change none of this. */
const signatureOf = (d: Draft): string => `${d.split}|${d.days}|${d.where}|${d.bias}`;

export default function SettingsPage() {
  const { snap } = useSnapshot();
  const profile = useProfile();
  const tr = useT();

  const current = profile?.split ?? 'sevenPattern';

  /**
   * Null until the user touches something, and back to null once applied.
   *
   * The profile arrives from IndexedDB a tick after the first render, which
   * breaks the obvious approaches in two different ways. Seeding state from it
   * once (`useState(profile?.days)`) captures `undefined` and shows everyone
   * the defaults forever — so the page claimed "Seven movement patterns, 3
   * days" regardless of what they actually trained, and rebuilding wrote those
   * phantom values over the real ones. Re-seeding whenever the profile changes
   * fixes the display but throws away an edit made in the moment before it
   * loads, which reads as a setting that simply refuses to change.
   *
   * Holding the edit separately settles both: with nothing edited the form is
   * derived from the profile and tracks it live, and an edit — whenever it is
   * made — wins until it is applied or the page is left.
   */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const saved = draftOf(profile);
  const { split, days, where, bias } = draft ?? saved;
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...(d ?? saved), ...p }));
  const dirty = !!draft && signatureOf(draft) !== signatureOf(saved);

  const dayOptions = allowedDays(split);

  /** A custom split is only offered once the user actually has one. */
  const options: SplitKey[] = current === 'custom' ? [...SPLIT_OPTIONS, 'custom'] : SPLIT_OPTIONS;

  // Settings you cannot see yet are not settings. Showing the form before the
  // profile lands invites an edit against the defaults, which would then be
  // applied over the real values — the page has to know what you train before
  // it offers to change it.
  if (!profile) {
    return (
      <Card>
        <p className="text-[var(--color-muted)]">{tr.t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.language')}</h2>
        <Segmented
          value={tr.lang}
          onChange={(v) => fireAndForget(setLang(v))}
          options={LANGS.map((l) => ({ value: l.id, label: l.label }))}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.theme')}</h2>
        <Segmented
          value={profile?.theme ?? 'system'}
          onChange={(v) => fireAndForget(setTheme(v as Theme))}
          options={[
            { value: 'system' as const, label: tr.t('theme.system') },
            { value: 'dark' as const, label: tr.t('theme.dark') },
            { value: 'light' as const, label: tr.t('theme.light') },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.units')}</h2>
        <Segmented
          value={profile?.unit ?? DEFAULT_PREFS.unit}
          onChange={(v) => fireAndForget(setUnit(v))}
          options={[
            { value: 'kg' as const, label: 'kg' },
            { value: 'lb' as const, label: 'lb' },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.split')}</h2>
        <div className="flex flex-col gap-2">
          {options.map((key) => {
            const preset = findSplit(key);
            const selected = split === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                // A custom split is the arrangement you already have; there is
                // nothing to re-apply, so it is shown but not selectable.
                disabled={key === 'custom'}
                onClick={() =>
                  patch({
                    split: key,
                    // Clamp the day count into what this split can cover.
                    days: allowedDays(key).includes(days) ? days : (preset?.defaultDays ?? 3),
                  })
                }
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-[11px] border px-3.5 py-3 text-left',
                  key === 'custom' ? 'cursor-default opacity-70' : 'cursor-pointer',
                  selected
                    ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-2)]',
                )}
              >
                <span className="flex items-baseline gap-2 font-semibold">
                  {tr.split(key)}
                  {key === current && (
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                        selected
                          ? 'bg-[var(--color-accent-ink)]/20'
                          : 'bg-[var(--color-surface)] text-[var(--color-muted)]',
                      )}
                    >
                      {tr.t('set.inUse')}
                    </span>
                  )}
                </span>
                <span
                  className={cn('text-xs', selected ? 'opacity-75' : 'text-[var(--color-muted)]')}
                >
                  {tr.t(`split.${key}H` as Key)}
                </span>
                {preset && preset.minDays > 2 && (
                  <span
                    className={cn('text-xs', selected ? 'opacity-75' : 'text-[var(--color-muted)]')}
                  >
                    {tr.t('split.minDays', { n: preset.minDays })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.myTraining')}</h2>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('set.rebuildBody')}</p>

        <Field label={tr.t('set.days')}>
          <Segmented
            value={days}
            onChange={(n) => patch({ days: n })}
            options={dayOptions.map((n) => ({ value: n, label: String(n) }))}
          />
        </Field>

        <Field label={tr.t('set.where')}>
          <Segmented
            value={where}
            onChange={(w) => patch({ where: w })}
            options={[
              { value: 'gym' as const, label: tr.t('onboard.where.gym') },
              { value: 'home' as const, label: tr.t('onboard.where.home') },
            ]}
          />
        </Field>

        <Field label={tr.t('set.bias')}>
          <select
            value={bias}
            onChange={(e) => patch({ bias: e.target.value as Bias })}
            className="min-h-[var(--spacing-tap)] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            {BIASES.map((b) => (
              <option key={b} value={b}>
                {tr.t(`bias.${b}` as Key)}
              </option>
            ))}
          </select>
        </Field>

        <Button
          variant="primary"
          onClick={() => setConfirm(true)}
          disabled={split === 'custom' || !dirty}
        >
          {tr.t('set.rebuild')}
        </Button>
        {/* Nothing here saves on its own: every one of these settings changes
            which exercises you are given, so they are applied together with the
            plan they produce. Saying so beats leaving the button inert with no
            explanation. */}
        <p className="text-xs text-[var(--color-muted)]">
          {dirty ? tr.t('set.pending') : tr.t('set.noChanges')}
        </p>
      </Card>

      <Card>
        <Button
          variant="danger"
          className="w-full"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            /**
             * Order matters, and both steps are the point.
             *
             * The last push goes first, because everything local is about to
             * be destroyed and an unsynced set would go with it. Then the
             * local database is cleared — without that, the next person to
             * sign in on this device inherits the previous account's training,
             * and the sync engine happily pushes it up under their name.
             */
            try {
              await sync();
            } catch {
              /* Offline. The wipe still has to happen; staying signed in is worse. */
            }
            try {
              await wipeLocal();
            } catch {
              /* Reported by the storage layer; the session must still end. */
            }
            await signOutAction();
          }}
        >
          {tr.t('app.signOut')}
        </Button>
      </Card>

      <Sheet title={tr.t('set.rebuildQ')} open={confirm} onClose={() => setConfirm(false)}>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('set.rebuildBody')}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setConfirm(false)}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              if (split === 'custom') return;
              await applySplit(snap, { split, days, where, bias });
              // Applied — let the form follow the profile again.
              setDraft(null);
              setConfirm(false);
            }}
          >
            {tr.t('common.confirm')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
