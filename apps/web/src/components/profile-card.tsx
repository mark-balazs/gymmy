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

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
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

/** How long the undo stays on offer: long enough to notice a mis-tap, short
 *  enough that the row does not become permanent furniture. */
const UNDO_MS = 10_000;

export function ProfileCard() {
  const profile = useProfile();
  const tr = useT();
  const file = useRef<HTMLInputElement>(null);

  const [name, setNameDraft] = useState<string | null>(null);
  const [year, setYearDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The picture just removed, kept only so it can be put straight back.
  const [removed, setRemoved] = useState<string | null>(null);

  const thisYear = new Date().getFullYear();
  // A draft while you are typing, the stored value otherwise. Without this the
  // field fights you: every keystroke syncs and re-renders from the store.
  const shownName = name ?? profile?.name ?? '';
  const shownYear = year ?? (profile?.birthYear ? String(profile.birthYear) : '');
  const avatar = profile?.avatar ?? null;

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed]);

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
    setRemoved(null);
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

  /* Undo rather than "are you sure?". A confirmation taxes everybody who meant
     it in order to protect the few who did not, and protects them badly — the
     second tap lands on muscle memory. Letting the removal happen and offering
     it back costs nothing in the common case and is complete in the rare one.
     It has to *write*, not merely restore this component's state: otherwise the
     picture is back on screen and gone again on the next load. */
  const remove = () => {
    if (!avatar) return;
    setRemoved(avatar);
    fireAndForget(setAvatar(null));
  };

  const undo = () => {
    if (!removed) return;
    fireAndForget(setAvatar(removed));
    setRemoved(null);
  };

  return (
    // A labelled region rather than a bare card: the settings screen is a list
    // of groups, and naming them is what lets a screen reader move between them
    // rather than walk every field in order.
    <Card className="flex flex-col gap-3">
      <section aria-label={tr.t('set.you')} className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('set.you')}</h2>

        <div className="flex items-center gap-3.5">
          {/* One control, not three. The picture used to be a button *and* sit
              beside a "Change picture" button doing the same thing, stacked on
              a second text link that destroyed it — two ghost links in a
              column, one of them irreversible and one of them redundant. The
              picture is the control; the badge is what says so. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => file.current?.click()}
            aria-label={tr.t(avatar ? 'set.picChange' : 'set.picAdd')}
            className={cn(
              'relative h-[72px] w-[72px] shrink-0 cursor-pointer rounded-full',
              'transition-transform duration-150 ease-[var(--ease-out-soft)] active:scale-[0.95]',
              'disabled:cursor-wait disabled:active:scale-100',
            )}
          >
            <Avatar src={avatar} className={cn(busy && 'opacity-60')} />

            <span
              aria-hidden
              className={cn(
                'absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full',
                'border-2 border-[var(--color-surface)]',
                'bg-[var(--color-accent)] text-[var(--color-accent-ink)]',
              )}
            >
              {busy ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5 animate-spin"
                >
                  <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M3.2 8.6h3.3l1.3-2.1h8.4l1.3 2.1h3.3v10.2H3.2z" />
                  <circle cx="12" cy="13.4" r="3.1" />
                </svg>
              )}
            </span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            {removed ? (
              <>
                <p className="text-sm text-[var(--color-muted)]">{tr.t('set.picRemoved')}</p>
                <Button className="min-h-9 px-3.5 text-sm" onClick={undo}>
                  {tr.t('set.picUndo')}
                </Button>
              </>
            ) : avatar ? (
              <Button className="min-h-9 px-3.5 text-sm" onClick={remove}>
                {tr.t('set.picRemove')}
              </Button>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">{tr.t('set.picHint')}</p>
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
