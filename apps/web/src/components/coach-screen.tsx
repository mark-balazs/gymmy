'use client';

/**
 * Writing plans, and deciding who gets them.
 *
 * The one screen in gymmy that genuinely needs a network: everything else reads
 * from the device, and a plan belongs to the person writing it rather than to
 * any one account's replica. So this is plain `fetch` with a soft failure — no
 * signal means an empty list and a line saying so, never a screen that hangs.
 *
 * A plan is built the way a week is built everywhere else: pick a split and a
 * number of days, and the slot skeleton falls out of `buildSlots`. The trainer
 * then says what goes in each slot, or leaves it to the app, which is a real
 * thing a coach wants — "a push here, you pick". That reuse is deliberate: a
 * second way of describing a week would be a second thing to keep in step with
 * the coverage rules.
 *
 * **Exercises are chosen by name from the default library.** Names are the only
 * handle that means the same thing in two accounts, and picking from the
 * library everybody is seeded with is what makes them resolve on the other
 * side. A trainer can still name something nobody has; the athlete is told
 * before they apply, and their week fills that slot itself.
 */

import { useEffect, useState } from 'react';
import { Button, Card, Field, Sheet, Summary, cn } from '@/components/ui';
import { Page } from '@/components/page';
import { useT } from '@/lib/client/hooks';
import {
  addMember,
  createGroup,
  createPlan,
  deleteGroup,
  deletePlan,
  fetchGroups,
  fetchPlan,
  fetchPlans,
  fetchShares,
  publishPlan,
  removeMember,
  revokeShare,
  savePlan,
  sharePlan,
  type Group,
  type PlanDraft,
  type SharedPlan,
  type Share,
} from '@/lib/client/plans';
import {
  SEED_EXERCISES,
  SPLIT_KEYS,
  buildSlots,
  findSplit,
  sessionLabel,
  type PlanSlot,
  type SplitKey,
} from '@athletic/domain';

/** The library every account is seeded with, which is what makes a name
 *  resolve on the other side. Sorted so a long select is navigable. */
const LIBRARY = [...SEED_EXERCISES.map((x) => x.name)].sort();

const PRESETS = SPLIT_KEYS.filter((k) => k !== 'custom') as Exclude<SplitKey, 'custom'>[];

/** A fresh skeleton from a preset, in the portable slot shape a plan stores. */
function skeleton(split: Exclude<SplitKey, 'custom'>, days: number): PlanSlot[] {
  const preset = findSplit(split);
  if (!preset) return [];
  return buildSlots(preset, days).map((s) => ({
    key: s.key,
    name: s.name,
    requiredRole: s.requiredRole,
    position: s.position,
    sessionIndex: s.sessionIndex,
    patternKeys: s.patternKeys,
    dayKey: s.dayKey,
    exerciseName: null,
    sets: 3,
    repRange: '6-12',
  }));
}

export function CoachScreen() {
  const tr = useT();
  const [plans, setPlans] = useState<SharedPlan[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: PlanDraft } | null>(null);
  const [sharing, setSharing] = useState<SharedPlan | null>(null);

  const reload = async () => {
    setPlans(await fetchPlans());
    setGroups(await fetchGroups());
  };

  /* Loaded inside the promise rather than by awaiting `reload` here: React's
     compiler rules out setting state directly from an effect body, and the
     `live` flag is what stops a slow response landing on an unmounted screen. */
  useEffect(() => {
    let live = true;
    void Promise.all([fetchPlans(), fetchGroups()]).then(([gotPlans, gotGroups]) => {
      if (!live) return;
      setPlans(gotPlans);
      setGroups(gotGroups);
    });
    return () => {
      live = false;
    };
  }, []);

  const mine = (plans ?? []).filter((p) => p.mine);

  const startNew = () =>
    setEditing({
      id: null,
      draft: {
        name: '',
        description: '',
        days: 3,
        where: 'gym',
        slots: skeleton('sevenPattern', 3),
      },
    });

  const startEdit = async (p: SharedPlan) => {
    const full = await fetchPlan(p.id);
    if (!full) return;
    setEditing({
      id: p.id,
      draft: {
        name: full.plan.name,
        description: full.plan.description,
        days: full.plan.days,
        where: full.plan.where,
        slots: full.plan.slots,
      },
    });
  };

  return (
    <Page>
      <Card className="flex flex-col gap-2">
        <h2 className="text-[17px] font-semibold">{tr.t('coach.open')}</h2>
        <p className="text-sm text-[var(--color-muted)]">{tr.t('coach.openBody')}</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold">{tr.t('coach.plans')}</h2>
          <Button className="min-h-9 px-3 text-sm" onClick={startNew}>
            {tr.t('coach.newPlan')}
          </Button>
        </div>

        {plans === null ? null : mine.length === 0 ? (
          <Summary tone="idle">{tr.t('coach.noPlans')}</Summary>
        ) : (
          <div role="list" className="flex flex-col gap-1.5">
            {mine.map((p) => (
              <div
                key={p.id}
                role="listitem"
                className="flex items-center gap-2 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => void startEdit(p)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <div className="truncate text-sm font-semibold">{p.name}</div>
                  <div className="text-[11px] text-[var(--color-muted)]">
                    {tr.t('coach.published', { n: p.version })} · {tr.t('plan.days', { n: p.days })}
                  </div>
                </button>
                <Button
                  className="min-h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => setSharing(p)}
                  aria-label={`${tr.t('coach.sharedWith')} — ${p.name}`}
                >
                  {tr.t('coach.sharedWith')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <GroupsCard groups={groups} onChange={() => void reload()} />

      {editing && (
        <PlanEditor
          state={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      {sharing && (
        <ShareSheet
          plan={sharing}
          groups={groups}
          onClose={() => {
            setSharing(null);
            void reload();
          }}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------- the editor */

function PlanEditor({
  state,
  onClose,
  onSaved,
}: {
  state: { id: string | null; draft: PlanDraft };
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useT();
  const [draft, setDraft] = useState(state.draft);
  const [split, setSplit] = useState<Exclude<SplitKey, 'custom'>>('sevenPattern');
  const [busy, setBusy] = useState(false);

  const patch = (over: Partial<PlanDraft>) => setDraft((d) => ({ ...d, ...over }));

  /* Changing the shape rebuilds the skeleton, which throws away the exercise
     choices made against the old one. That is honest rather than clever: the
     slots are different slots, and silently carrying names across positions
     that no longer mean the same thing would be worse than asking again. */
  const reshape = (next: Exclude<SplitKey, 'custom'>, days: number) => {
    setSplit(next);
    patch({ days, slots: skeleton(next, days) });
  };

  const setSlot = (sessionIndex: number, position: number, over: Partial<PlanSlot>) =>
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) =>
        s.sessionIndex === sessionIndex && s.position === position ? { ...s, ...over } : s,
      ),
    }));

  const save = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const res = state.id ? await savePlan(state.id, draft) : await createPlan(draft);
      if (res) onSaved();
    } finally {
      setBusy(false);
    }
  };

  const sessions = [...new Set(draft.slots.map((s) => s.sessionIndex))].sort((a, b) => a - b);

  return (
    <Sheet
      title={state.id ? draft.name || tr.t('coach.newPlan') : tr.t('coach.newPlan')}
      open
      onClose={onClose}
    >
      <Field label={tr.t('coach.name')}>
        <input
          type="text"
          maxLength={80}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
        />
      </Field>

      <Field label={tr.t('coach.description')}>
        <textarea
          maxLength={600}
          rows={2}
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
          className="w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2"
        />
      </Field>

      <Field label={tr.t('coach.shape')}>
        <div className="flex gap-2">
          <select
            value={split}
            onChange={(e) => reshape(e.target.value as Exclude<SplitKey, 'custom'>, draft.days)}
            className="min-h-[var(--spacing-tap)] min-w-0 flex-1 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            {PRESETS.map((k) => (
              <option key={k} value={k}>
                {tr.t(`split.${k}` as Parameters<typeof tr.t>[0])}
              </option>
            ))}
          </select>
          <select
            aria-label={tr.t('set.days')}
            value={draft.days}
            onChange={(e) => reshape(split, Number(e.target.value))}
            className="min-h-[var(--spacing-tap)] shrink-0 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <p className="text-xs font-semibold text-[var(--color-muted)]">{tr.t('coach.exercises')}</p>

      <div className="flex flex-col gap-3">
        {sessions.map((sessionIndex) => (
          <div key={sessionIndex} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">{sessionLabel(sessionIndex)}</span>
            {draft.slots
              .filter((s) => s.sessionIndex === sessionIndex)
              .sort((a, b) => a.position - b.position)
              .map((s) => (
                <div key={s.position} className="flex items-center gap-2">
                  <select
                    aria-label={`${sessionLabel(sessionIndex)} ${s.position + 1}`}
                    value={s.exerciseName ?? ''}
                    onChange={(e) =>
                      setSlot(sessionIndex, s.position, { exerciseName: e.target.value || null })
                    }
                    className="min-h-10 min-w-0 flex-1 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 text-sm"
                  >
                    <option value="">{tr.t('coach.anyExercise')}</option>
                    {LIBRARY.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`${tr.t('cal.sets')} — ${sessionLabel(sessionIndex)} ${s.position + 1}`}
                    min={1}
                    max={10}
                    value={s.sets}
                    onChange={(e) =>
                      setSlot(sessionIndex, s.position, { sets: Number(e.target.value) })
                    }
                    className="num min-h-10 w-14 shrink-0 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 text-sm"
                  />
                </div>
              ))}
          </div>
        ))}
      </div>

      <Summary tone="idle">{tr.t('coach.publishBody')}</Summary>

      <div className="flex gap-2">
        <Button
          variant="primary"
          className="flex-1"
          disabled={busy || !draft.name.trim()}
          onClick={() => void save()}
        >
          {tr.t('common.save')}
        </Button>
        {state.id && (
          <Button
            className="shrink-0"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await publishPlan(state.id!);
              setBusy(false);
              onSaved();
            }}
          >
            {tr.t('coach.publish')}
          </Button>
        )}
      </div>

      {state.id && (
        <>
          <Summary tone="idle">{tr.t('coach.deleteBody')}</Summary>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await deletePlan(state.id!);
              setBusy(false);
              onSaved();
            }}
          >
            {tr.t('coach.deletePlan')}
          </Button>
        </>
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------- sharing */

function ShareSheet({
  plan,
  groups,
  onClose,
}: {
  plan: SharedPlan;
  groups: Group[];
  onClose: () => void;
}) {
  const tr = useT();
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => setShares(await fetchShares(plan.id));

  useEffect(() => {
    let live = true;
    void fetchShares(plan.id).then((got) => {
      if (live) setShares(got);
    });
    return () => {
      live = false;
    };
  }, [plan.id]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={plan.name} open onClose={onClose}>
      <p className="text-xs font-semibold text-[var(--color-muted)]">{tr.t('coach.sharedWith')}</p>
      {shares.length === 0 ? (
        <Summary tone="idle">{tr.t('coach.nobody')}</Summary>
      ) : (
        <div className="flex flex-col gap-1.5">
          {shares.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.groupName ?? s.targetName ?? '—'}
              </span>
              <Button
                className="min-h-8 shrink-0 px-2.5 text-xs"
                disabled={busy}
                onClick={() => void act(() => revokeShare(plan.id, s.id))}
              >
                {tr.t('coach.remove')}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Field label={tr.t('coach.shareEmail')}>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[var(--spacing-tap)] min-w-0 flex-1 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          />
          <Button
            className="shrink-0"
            disabled={busy || !email.trim()}
            onClick={() =>
              void act(async () => {
                await sharePlan(plan.id, { userEmail: email.trim() });
                setEmail('');
              })
            }
          >
            {tr.t('coach.addMember')}
          </Button>
        </div>
      </Field>
      {/* Said out loud, because the silence is deliberate and otherwise reads
          as the feature not working. */}
      <p className="text-xs text-[var(--color-muted)]">{tr.t('coach.emailHint')}</p>

      {groups.length > 0 && (
        <Field label={tr.t('coach.shareGroup')}>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const groupId = e.target.value;
              e.target.value = '';
              if (groupId) void act(() => sharePlan(plan.id, { groupId }));
            }}
            className="min-h-[var(--spacing-tap)] w-full rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------- groups */

function GroupsCard({ groups, onChange }: { groups: Group[]; onChange: () => void }) {
  const tr = useT();
  const [open, setOpen] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-[17px] font-semibold">{tr.t('coach.groups')}</h2>

      {groups.length === 0 ? (
        <Summary tone="idle">{tr.t('coach.noGroups')}</Summary>
      ) : (
        <div role="list" className="flex flex-col gap-1.5">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="listitem"
              onClick={() => setOpen(g)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left',
                'border-[var(--color-line)] bg-[var(--color-surface-2)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.name}</span>
              <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
                {tr.t('coach.members', { n: g.members.length })}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          maxLength={60}
          value={name}
          aria-label={tr.t('coach.newGroup')}
          placeholder={tr.t('coach.newGroup')}
          onChange={(e) => setName(e.target.value)}
          className="min-h-[var(--spacing-tap)] min-w-0 flex-1 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
        />
        <Button
          className="shrink-0"
          disabled={busy || !name.trim()}
          onClick={() =>
            void act(async () => {
              await createGroup(name.trim());
              setName('');
            })
          }
        >
          {tr.t('coach.newGroup')}
        </Button>
      </div>

      {open && (
        <Sheet title={open.name} open onClose={() => setOpen(null)}>
          {open.members.length === 0 ? (
            <Summary tone="idle">{tr.t('coach.nobody')}</Summary>
          ) : (
            <div className="flex flex-col gap-1.5">
              {open.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name ?? m.email}</span>
                  <Button
                    className="min-h-8 shrink-0 px-2.5 text-xs"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await removeMember(open.id, m.id);
                        setOpen(null);
                      })
                    }
                  >
                    {tr.t('coach.remove')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Field label={tr.t('coach.addMember')}>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[var(--spacing-tap)] min-w-0 flex-1 rounded-[11px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3"
              />
              <Button
                className="shrink-0"
                disabled={busy || !email.trim()}
                onClick={() =>
                  void act(async () => {
                    await addMember(open.id, email.trim());
                    setEmail('');
                    setOpen(null);
                  })
                }
              >
                {tr.t('coach.addMember')}
              </Button>
            </div>
          </Field>
          <p className="text-xs text-[var(--color-muted)]">{tr.t('coach.emailHint')}</p>

          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await deleteGroup(open.id);
                setOpen(null);
              })
            }
          >
            {tr.t('coach.remove')}
          </Button>
        </Sheet>
      )}
    </Card>
  );
}
