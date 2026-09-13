'use client';

/**
 * The slot editor — the only screen that can produce a custom split.
 *
 * Everything underneath has always supported one: slots are plain rows, the
 * generator reads whatever skeleton it is given, and a period records the
 * coverage goal a hand-built week inherits. What was missing was any way to
 * write a slot by hand, which made "Custom" a state the app could describe but
 * never reach.
 *
 * It starts from the week you already train rather than a blank page, because
 * arranging a week from nothing is a harder question than most people want to
 * be asked, and because a preset is a perfectly good first draft of one.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Sheet, Summary, cn } from '@/components/ui';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { applyCustomSplit } from '@/lib/client/mutations';
import type { Key } from '@/lib/i18n';
import {
  coveragePatterns,
  coversFor,
  currentSlotDrafts,
  DAY_KEYS,
  DEFAULT_PREFS,
  SLOT_KEYS,
  SLOT_ROLES,
  type DayKey,
  type PatternKey,
  type SlotDraft,
  type SlotKey,
  type SlotRole,
} from '@athletic/domain';

/** Matches the range the presets offer, so a hand-built week cannot end up
 *  somewhere the rest of the app has never been asked to render. */
const MIN_DAYS = 2;
const MAX_DAYS = 6;

interface Day {
  dayKey: DayKey | null;
  slots: SlotDraft[];
}

const groupByDay = (drafts: SlotDraft[], days: number): Day[] =>
  Array.from({ length: days }, (_, d) => {
    const slots = drafts.filter((s) => s.sessionIndex === d);
    return { dayKey: slots[0]?.dayKey ?? 'full', slots };
  });

/** Position and session are re-derived from the arrangement on screen rather
 *  than carried along, so moving a slot cannot leave the stored order
 *  disagreeing with the order you are looking at. */
const flatten = (week: Day[]): SlotDraft[] =>
  week.flatMap((day, sessionIndex) =>
    day.slots.map((slot, position) => ({ ...slot, position, sessionIndex, dayKey: day.dayKey })),
  );

const blankSlot = (): SlotDraft => ({
  key: 'accessory',
  name: 'accessory',
  requiredRole: 'Any',
  position: 0,
  sessionIndex: 0,
  patternKeys: null,
  dayKey: null,
});

export default function CustomSplitPage() {
  const { snap, ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();
  const router = useRouter();

  /**
   * Null until something is edited, exactly as the Settings form works and for
   * the same reason: the snapshot lands a tick after the first render, so a
   * draft seeded from it once would be seeded from an empty week.
   */
  const [draft, setDraft] = useState<Day[] | null>(null);
  const [editing, setEditing] = useState<{ day: number; slot: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const days = profile?.days ?? DEFAULT_PREFS.days;
  const week = draft ?? groupByDay(currentSlotDrafts(ix, days), days);

  // Nothing to edit until the week has arrived. Rendering an empty skeleton
  // here would invite someone to "fix" it, and saving that would wipe the week
  // that was still on its way down from the server.
  if (!profile || !ix.slots.length) {
    return (
      <Card>
        <p className="text-[var(--color-muted)]">{tr.t('common.loading')}</p>
      </Card>
    );
  }

  const patchDay = (d: number, patch: Partial<Day>) =>
    setDraft(week.map((day, i) => (i === d ? { ...day, ...patch } : day)));

  const patchSlot = (d: number, s: number, patch: Partial<SlotDraft>) =>
    patchDay(d, {
      slots: week[d]!.slots.map((slot, i) => (i === s ? { ...slot, ...patch } : slot)),
    });

  const move = (d: number, s: number, delta: number) => {
    const slots = [...week[d]!.slots];
    const to = s + delta;
    if (to < 0 || to >= slots.length) return;
    [slots[s], slots[to]] = [slots[to]!, slots[s]!];
    patchDay(d, { slots });
  };

  const addDay = () => {
    // Copied from the last day rather than started empty: a new day with one
    // unconfigured slot is a chore, and a day shaped like the one before it is
    // almost always what someone adding a fourth day meant.
    const last = week[week.length - 1];
    setDraft([
      ...week,
      {
        dayKey: last?.dayKey ?? 'full',
        slots: (last?.slots ?? [blankSlot()]).map((s) => ({ ...s })),
      },
    ]);
  };

  const slotLabel = (slot: SlotDraft): string =>
    slot.key ? tr.t(`slot.${slot.key}` as Key) : slot.name;

  /**
   * What this arrangement would make a complete week.
   *
   * Shown before saving rather than discovered afterwards: editing slots can
   * genuinely take a movement out of reach, and `coversFor` will then quietly
   * stop asking for it. That is the right behaviour — a box that cannot be
   * ticked is worse than no box — but it is not something to find out from a
   * coverage grid that silently lost a tile.
   */
  const counted = ix.patterns.filter((p) => p.counts);
  const goal = coveragePatterns(ix)
    .map((p) => p.key)
    .filter((k): k is PatternKey => !!k);
  const next = coversFor('custom', flatten(week), counted, goal);
  const dropped = goal.filter((k) => !next.includes(k));

  const target = editing ? (week[editing.day]?.slots[editing.slot] ?? null) : null;
  const lastSlotOfDay = editing ? week[editing.day]!.slots.length <= 1 : false;

  const save = async () => {
    setSaving(true);
    try {
      await applyCustomSplit(snap, {
        drafts: flatten(week),
        days: week.length,
        where: profile.where ?? DEFAULT_PREFS.where,
        bias: profile.bias ?? DEFAULT_PREFS.bias,
      });
      setConfirm(false);
      // Straight to the week it just built — the whole point of saving was to
      // see what the arrangement produced.
      router.push('/week');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="flex flex-col gap-2">
        <Link href="/settings" className="text-xs font-semibold text-[var(--color-muted)]">
          ‹ {tr.t('split.backToSettings')}
        </Link>
        <h2 className="text-[22px] leading-tight font-bold">{tr.t('split.editTitle')}</h2>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('split.editIntro')}</p>
      </Card>

      {week.map((day, d) => (
        <Card key={d} className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[17px] font-semibold">{tr.t('common.day', { n: d + 1 })}</h3>
            <select
              aria-label={tr.t('split.dayType')}
              value={day.dayKey ?? 'full'}
              onChange={(e) => patchDay(d, { dayKey: e.target.value as DayKey })}
              className="min-h-9 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 text-xs"
            >
              {DAY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {tr.day(k)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            {day.slots.map((slot, s) => (
              <div key={s} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => setEditing({ day: d, slot: s })}
                  aria-label={tr.t('split.editSlot', { name: slotLabel(slot) })}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left"
                >
                  <span className="w-full truncate text-sm font-semibold">{slotLabel(slot)}</span>
                  <span className="w-full truncate text-xs text-[var(--color-muted)]">
                    {tr.holds(slot)}
                  </span>
                </button>
                {(['up', 'down'] as const).map((dir) => {
                  const delta = dir === 'up' ? -1 : 1;
                  const at = s + delta;
                  return (
                    <button
                      key={dir}
                      type="button"
                      disabled={at < 0 || at >= day.slots.length}
                      aria-label={tr.t(dir === 'up' ? 'split.moveUp' : 'split.moveDown', {
                        name: slotLabel(slot),
                      })}
                      onClick={() => move(d, s, delta)}
                      className={cn(
                        'w-9 shrink-0 cursor-pointer rounded-[11px] border border-[var(--color-line)]',
                        'bg-[var(--color-surface-2)] text-sm text-[var(--color-muted)]',
                        'disabled:cursor-not-allowed disabled:opacity-30',
                      )}
                    >
                      {dir === 'up' ? '↑' : '↓'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <Button
            className="self-start"
            onClick={() => patchDay(d, { slots: [...day.slots, blankSlot()] })}
          >
            {tr.t('split.addSlot')}
          </Button>
        </Card>
      ))}

      <Card className="flex gap-2">
        <Button className="flex-1" disabled={week.length >= MAX_DAYS} onClick={addDay}>
          {tr.t('split.addDay')}
        </Button>
        <Button
          className="flex-1"
          disabled={week.length <= MIN_DAYS}
          onClick={() => setDraft(week.slice(0, -1))}
        >
          {tr.t('split.removeDay')}
        </Button>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <h3 className="text-[17px] font-semibold">{tr.t('split.reach')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {next.map((k) => (
            <span
              key={k}
              className="rounded-full bg-[var(--color-good-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]"
            >
              {tr.t(`pattern.${k}` as Key)}
            </span>
          ))}
        </div>

        {dropped.length > 0 && (
          <Summary tone="gap">
            {tr.t('split.drops', {
              list: dropped.map((k) => tr.t(`pattern.${k}` as Key).toLowerCase()).join(', '),
            })}
          </Summary>
        )}

        <Button variant="primary" disabled={saving} onClick={() => setConfirm(true)}>
          {tr.t('split.save')}
        </Button>
      </Card>

      {editing && target && (
        <Sheet title={slotLabel(target)} open onClose={() => setEditing(null)}>
          <Field label={tr.t('split.slotName')}>
            <select
              value={target.key ?? 'accessory'}
              onChange={(e) => {
                const key = e.target.value as SlotKey;
                patchSlot(editing.day, editing.slot, { key, name: key });
              }}
              className="min-h-[var(--spacing-tap)] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
            >
              {SLOT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {tr.t(`slot.${k}` as Key)}
                </option>
              ))}
            </select>
          </Field>

          <Field label={tr.t('split.slotHolds')}>
            <select
              value={target.requiredRole ?? 'Any'}
              onChange={(e) =>
                patchSlot(editing.day, editing.slot, {
                  requiredRole: e.target.value as SlotRole,
                })
              }
              className="min-h-[var(--spacing-tap)] rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
            >
              {SLOT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr.t(`role.${r}` as Key)}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-[var(--color-muted)]">
              {tr.t('split.pinTitle')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ix.patterns.map((p) => {
                const key = p.key;
                if (!key) return null;
                const on = !!target.patternKeys?.includes(key);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const current = target.patternKeys ?? [];
                      const nextKeys = on ? current.filter((k) => k !== key) : [...current, key];
                      // Back to null rather than an empty list: an empty
                      // `patternKeys` and "no pins at all" must not be two
                      // different states, or the role would stop applying.
                      patchSlot(editing.day, editing.slot, {
                        patternKeys: nextKeys.length ? nextKeys : null,
                      });
                    }}
                    className={cn(
                      'min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold',
                      on
                        ? 'border-transparent bg-[var(--color-accent)] text-[var(--color-accent-ink)]'
                        : 'border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-muted)]',
                    )}
                  >
                    {tr.pattern(p)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-muted)]">{tr.t('split.pinNote')}</p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={lastSlotOfDay}
              onClick={() => {
                patchDay(editing.day, {
                  slots: week[editing.day]!.slots.filter((_, i) => i !== editing.slot),
                });
                setEditing(null);
              }}
            >
              {tr.t('split.removeSlot')}
            </Button>
            {/* "Done", not "Save" — nothing is committed until the split
                itself is saved, and two differently-scoped Saves on one screen
                is how somebody leaves believing they had. */}
            <Button variant="primary" className="flex-1" onClick={() => setEditing(null)}>
              {tr.t('common.done')}
            </Button>
          </div>
          {lastSlotOfDay && (
            <p className="text-xs text-[var(--color-muted)]">{tr.t('split.lastSlot')}</p>
          )}
        </Sheet>
      )}

      <Sheet title={tr.t('split.saveQ')} open={confirm} onClose={() => setConfirm(false)}>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('split.saveBody')}</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setConfirm(false)}>
            {tr.t('common.cancel')}
          </Button>
          <Button variant="primary" className="flex-1" disabled={saving} onClick={save}>
            {tr.t('common.confirm')}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
