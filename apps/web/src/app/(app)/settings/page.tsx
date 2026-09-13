'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Field, InfoButton, Segmented, Sheet, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { SplitSheet } from '@/components/split-sheet';
import { ProfileCard } from '@/components/profile-card';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import {
  applyCustomSplit,
  applySplit,
  fireAndForget,
  setLang,
  setTheme,
  setUnit,
} from '@/lib/client/mutations';
import { sync, wipeLocal } from '@/lib/client/sync';
import { deleteAccountAction, signOutAction } from './actions';
import { LANGS } from '@/lib/i18n';
import type { Key } from '@/lib/i18n';
import {
  allowedDays,
  BIASES,
  currentSlotDrafts,
  DEFAULT_PREFS,
  findSplit,
  mondayOf,
  SPLITS,
  type Bias,
  type Lang,
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
  const { snap, ix } = useSnapshot();
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
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  /** How much of their life is in here, for the deletion warning to be honest
   *  about. Distinct weeks trained rather than calendar weeks since they
   *  joined — an account opened in January and used twice is two weeks. */
  const trainedWeeks = new Set(ix.logs.map((l) => mondayOf(l.date))).size;
  const [info, setInfo] = useState<SplitKey | null>(null);

  const saved = draftOf(profile);
  const { split, days, where, bias } = draft ?? saved;
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...(d ?? saved), ...p }));
  const dirty = !!draft && signatureOf(draft) !== signatureOf(saved);

  const dayOptions = allowedDays(split);

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
    <Page>
      {/* Everything the app knows about you, in one card.
          These used to be three: a name and picture had nowhere to go at all,
          while sex and height sat under "About you" — a separate box for facts
          of exactly the same kind. The division was never about the reader. */}
      <ProfileCard />

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.split')}</h2>
        <div className="flex flex-col gap-2">
          {SPLIT_OPTIONS.map((key) => {
            const preset = findSplit(key);
            const selected = split === key;
            const sub = cn('text-xs', selected ? 'opacity-75' : 'text-[var(--color-muted)]');
            return (
              <div
                key={key}
                className={cn(
                  'flex items-stretch gap-1 rounded-[11px] border pr-1',
                  selected
                    ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-2)]',
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    patch({
                      split: key,
                      // Clamp the day count into what this split can cover.
                      days: allowedDays(key).includes(days) ? days : (preset?.defaultDays ?? 3),
                    })
                  }
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 px-3.5 py-3 text-left"
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
                  <span className={sub}>{tr.t(`split.${key}H` as Key)}</span>
                  {preset && preset.minDays > 2 && (
                    <span className={sub}>{tr.t('split.minDays', { n: preset.minDays })}</span>
                  )}
                </button>
                {/* A one-line hint is not enough to choose on: which days it
                    makes, and what it will then call a complete week, is the
                    whole of the decision being made here. */}
                <InfoButton
                  label={tr.t('split.info', { split: tr.split(key) })}
                  onClick={() => setInfo(key)}
                  className={selected ? 'text-[var(--color-accent-ink)]/75' : undefined}
                />
              </div>
            );
          })}

          {/* Custom is somewhere you go, not an option you tick — there is
              nothing to apply until the week has actually been arranged. It is
              always offered now; the old picker revealed it only once you had a
              custom split already, which no screen could give you. */}
          <Link
            href="/settings/split"
            className={cn(
              'flex items-center gap-3 rounded-[11px] border bg-[var(--color-surface-2)] px-3.5 py-3',
              current === 'custom' ? 'border-[var(--color-accent)]' : 'border-[var(--color-line)]',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2 font-semibold">
                {tr.t('split.buildOwn')}
                {current === 'custom' && (
                  <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--color-muted)] uppercase">
                    {tr.t('set.inUse')}
                  </span>
                )}
              </span>
              <span className="text-xs text-[var(--color-muted)]">{tr.t('split.customH')}</span>
            </span>
            <span aria-hidden className="text-[var(--color-muted)]">
              ›
            </span>
          </Link>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.myTraining')}</h2>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('set.rebuildBody')}</p>

        {/* A hand-built week pins every slot to its own day, so how many days it
            has is part of the arrangement rather than a dial beside it —
            turning it here would leave the new day with nothing in it. */}
        {split === 'custom' ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-muted)]">
              {tr.t('set.days')}
            </span>
            <p className="text-sm">
              {tr.t('sub.daysPerWeek', { n: days })}{' '}
              <span className="text-[var(--color-muted)]">{tr.t('set.daysCustom')}</span>
            </p>
            <Link
              href="/settings/split"
              className="text-xs font-semibold text-[var(--color-accent)]"
            >
              {tr.t('set.editSplit')}
            </Link>
          </div>
        ) : (
          <Field label={tr.t('set.days')}>
            <Segmented
              value={days}
              onChange={(n) => patch({ days: n })}
              options={dayOptions.map((n) => ({ value: n, label: String(n) }))}
            />
          </Field>
        )}

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

        <Button variant="primary" onClick={() => setConfirm(true)} disabled={!dirty}>
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

      {/* One card, because these are the same kind of thing: how the app
          presents itself. Three separate boxes for three single controls made
          the page read as a list of unrelated settings. */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.app')}</h2>

        <Field label={tr.t('set.language')}>
          {/* A select rather than a segmented control: five languages will not
              fit across a phone, and the list is meant to grow. */}
          <select
            aria-label={tr.t('set.language')}
            value={tr.lang}
            onChange={(e) => fireAndForget(setLang(e.target.value as Lang))}
            className="min-h-[var(--spacing-tap)] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={tr.t('set.theme')}>
          <Segmented
            value={profile?.theme ?? 'system'}
            onChange={(v) => fireAndForget(setTheme(v as Theme))}
            options={[
              { value: 'system' as const, label: tr.t('theme.system') },
              { value: 'dark' as const, label: tr.t('theme.dark') },
              { value: 'light' as const, label: tr.t('theme.light') },
            ]}
          />
        </Field>

        <Field label={tr.t('set.units')}>
          <Segmented
            value={profile?.unit ?? DEFAULT_PREFS.unit}
            onChange={(v) => fireAndForget(setUnit(v))}
            options={[
              { value: 'kg' as const, label: 'kg' },
              { value: 'lb' as const, label: 'lb' },
            ]}
          />
        </Field>
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

      {/* Separate from sign-out and visually quieter than it, because the two
          are one tap apart and only one of them is recoverable. */}
      <Card className="flex flex-col gap-2">
        <h2 className="text-[17px] font-semibold">{tr.t('set.deleteTitle')}</h2>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('set.deleteBody')}</p>
        <Button
          variant="danger"
          className="self-start px-0"
          disabled={leaving}
          onClick={() => setDeleting(true)}
        >
          {tr.t('set.deleteGo')}
        </Button>
      </Card>

      <Sheet title={tr.t('set.deleteQ')} open={deleting} onClose={() => setDeleting(false)}>
        {/* Counted from your own data rather than described in the abstract.
            "Everything will be deleted" is a sentence people skim; "1,284 sets
            across 22 weeks" is one they read. */}
        <p className="text-sm">
          {tr.t('set.deleteWhat', {
            sets: ix.logs.length,
            weeks: trainedWeeks,
          })}
        </p>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('set.deleteForever')}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setDeleting(false)}>
            {tr.t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={leaving}
            onClick={async () => {
              setLeaving(true);
              /* The device is wiped first and deliberately without a sync.
                 Pushing local changes up to an account that is about to be
                 erased is work done to destroy it a moment later, and if the
                 server call then fails we have still left this device clean. */
              try {
                await wipeLocal();
              } catch {
                /* Reported by the storage layer; the account must still go. */
              }
              await deleteAccountAction();
              // The action ends the session but deliberately does not redirect,
              // so that the deletion happens before we leave.
              window.location.replace('/sign-in');
            }}
          >
            {tr.t('set.deleteConfirm')}
          </Button>
        </div>
      </Sheet>

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
              // A custom week keeps its arrangement and is regenerated against
              // it. Without this branch "I train at home now" would be
              // unanswerable for anyone who had built their own split.
              if (split === 'custom') {
                await applyCustomSplit(snap, {
                  drafts: currentSlotDrafts(ix, days),
                  days,
                  where,
                  bias,
                });
              } else {
                await applySplit(snap, { split, days, where, bias });
              }
              // Applied — let the form follow the profile again.
              setDraft(null);
              setConfirm(false);
            }}
          >
            {tr.t('common.confirm')}
          </Button>
        </div>
      </Sheet>

      {info && <SplitSheet split={info} onClose={() => setInfo(null)} />}
    </Page>
  );
}
