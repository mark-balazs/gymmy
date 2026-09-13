'use client';

/**
 * Who you are, as far as the app is concerned.
 *
 * Three fields, and each earns its place rather than being there because a
 * settings screen usually has them:
 *
 *  - **a name**, so the app can address you rather than nobody;
 *  - **a year of birth**, because the strength score allows for age and until
 *    there was somewhere to enter one, that allowance was unreachable code;
 *  - **a picture**, which is the only thing here that is purely yours;
 *  - **sex and height**, which the strength score needs and which used to sit
 *    in a separate card called "About you" — a different box for facts of
 *    exactly the same kind.
 *
 * All of it is optional and the app never invents any of it. An empty name is
 * an empty name, not "Athlete".
 */

import { useRef, useState } from 'react';
import { Button, Card, Field, cn } from '@/components/ui';
import { useProfile, useT } from '@/lib/client/hooks';
import {
  fireAndForget,
  setAvatar,
  setBirthYear,
  setHeight,
  setName,
  setSex,
} from '@/lib/client/mutations';
import { AvatarError, toAvatar } from '@/lib/client/avatar';
import { DEFAULT_PREFS, SEXES, type Profile } from '@athletic/domain';
import type { Key } from '@/lib/i18n';

/** The oldest plausible living person, matching the wire schema. */
const EARLIEST = 1900;

export function ProfileCard() {
  const profile = useProfile();
  const tr = useT();
  const file = useRef<HTMLInputElement>(null);

  const [name, setNameDraft] = useState<string | null>(null);
  const [year, setYearDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const thisYear = new Date().getFullYear();
  // A draft while you are typing, the stored value otherwise. Without this the
  // field fights you: every keystroke syncs and re-renders from the store.
  const shownName = name ?? profile?.name ?? '';
  const shownYear = year ?? (profile?.birthYear ? String(profile.birthYear) : '');
  const avatar = profile?.avatar ?? null;

  const commitYear = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '') return fireAndForget(setBirthYear(null));
    if (!Number.isInteger(n) || n < EARLIEST || n > thisYear) {
      setProblem(tr.t('set.yearBad', { from: EARLIEST, to: thisYear }));
      return;
    }
    setProblem(null);
    fireAndForget(setBirthYear(n));
  };

  const pick = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true);
    setProblem(null);
    try {
      fireAndForget(setAvatar(await toAvatar(chosen)));
    } catch (err) {
      // Named rather than swallowed: a picture that silently does not appear
      // is indistinguishable from the app being broken.
      setProblem(
        err instanceof AvatarError && err.message === 'too-large'
          ? tr.t('set.picTooBig')
          : tr.t('set.picBad'),
      );
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    // A labelled region rather than a bare card: the settings screen is a list
    // of groups, and naming them is what lets a screen reader move between them
    // rather than walk every field in order.
    <Card className="flex flex-col gap-3">
      <section aria-label={tr.t('set.you')} className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.you')}</h2>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => file.current?.click()}
            aria-label={tr.t(avatar ? 'set.picChange' : 'set.picAdd')}
            className={cn(
              'grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full',
              'border border-[var(--color-line)] bg-[var(--color-surface-2)]',
              busy && 'opacity-50',
            )}
          >
            {avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element -- a data URL:
               there is nothing for an image optimiser to fetch or transform. */
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden className="text-xl text-[var(--color-muted)]">
                +
              </span>
            )}
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Button
              variant="ghost"
              className="min-h-9 justify-start px-0 text-sm text-[var(--color-accent-2)]"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {tr.t(avatar ? 'set.picChange' : 'set.picAdd')}
            </Button>
            {avatar && (
              <Button
                variant="ghost"
                className="min-h-9 justify-start px-0 text-sm text-[var(--color-muted)]"
                onClick={() => fireAndForget(setAvatar(null))}
              >
                {tr.t('set.picRemove')}
              </Button>
            )}
          </div>

          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>

        <Field label={tr.t('set.name')}>
          <input
            type="text"
            maxLength={60}
            autoComplete="given-name"
            value={shownName}
            placeholder={tr.t('set.namePlaceholder')}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={(e) => {
              setNameDraft(null);
              fireAndForget(setName(e.target.value));
            }}
            className="min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          />
        </Field>

        <Field label={tr.t('set.birthYear')}>
          <input
            type="number"
            inputMode="numeric"
            min={EARLIEST}
            max={thisYear}
            value={shownYear}
            placeholder={tr.t('set.birthYearPlaceholder')}
            onChange={(e) => setYearDraft(e.target.value)}
            onBlur={(e) => {
              setYearDraft(null);
              commitYear(e.target.value);
            }}
            className="num min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          />
        </Field>
        <p className="text-xs text-[var(--color-muted)]">{tr.t('set.birthYearWhy')}</p>

        <Field label={tr.t('set.sex')}>
          <select
            value={profile?.sex ?? DEFAULT_PREFS.sex}
            onChange={(e) => fireAndForget(setSex(e.target.value as Profile['sex']))}
            className="min-h-[var(--spacing-tap)] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            {SEXES.map((x) => (
              <option key={x} value={x}>
                {tr.t(`sex.${x}` as Key)}
              </option>
            ))}
          </select>
        </Field>
        {/* Said plainly, because being asked this in a training app without a
          reason is a fair thing to be wary of. */}
        <p className="text-xs text-[var(--color-muted)]">{tr.t('set.sexWhy')}</p>

        <Field label={tr.t('set.height')}>
          <input
            type="number"
            inputMode="numeric"
            value={profile?.heightCm ?? ''}
            onChange={(e) =>
              fireAndForget(setHeight(e.target.value === '' ? null : Number(e.target.value)))
            }
            className="num min-h-[var(--spacing-tap)] w-full min-w-0 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          />
        </Field>

        {problem && <p className="text-xs text-[var(--color-bad)]">{problem}</p>}
      </section>
    </Card>
  );
}
