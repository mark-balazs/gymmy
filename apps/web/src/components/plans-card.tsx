'use client';

/**
 * Plans somebody has shared with you.
 *
 * This sits above the split presets in Settings rather than replacing them,
 * because the choice is genuinely three-way now: a plan somebody wrote for you,
 * one of the built-in splits, or a week you build yourself. Nothing about the
 * last two changed, and a person with no trainer never sees this card at all —
 * an empty section explaining a feature you are not part of is clutter.
 *
 * **Applying is a copy, taken once.** It writes ordinary slots, an appended
 * period and generated entries through the same funnel a preset goes through;
 * afterwards your week is yours, works offline, and cannot be reached into by
 * the person who wrote it. When they publish a newer edition this card says so
 * and offers it. It does not take it.
 */

import { useEffect, useState } from 'react';
import { Button, Card, Sheet, Summary, cn } from '@/components/ui';
import { Presence } from '@/components/presence';
import { InfoTip } from '@/components/info-tip';
import { useProfile, useSnapshot, useT } from '@/lib/client/hooks';
import { applySharedPlan } from '@/lib/client/mutations';
import { fetchPlan, fetchPlans, type PlanDetail, type SharedPlan } from '@/lib/client/plans';
import { planIsStale, planOf, planSessions, unresolvedExercises } from '@athletic/domain';

export function PlansCard() {
  const { snap, ix } = useSnapshot();
  const profile = useProfile();
  const tr = useT();

  const [plans, setPlans] = useState<SharedPlan[] | null>(null);
  const [open, setOpen] = useState<PlanDetail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchPlans().then((got) => {
      if (live) setPlans(got);
    });
    return () => {
      live = false;
    };
  }, []);

  const applied = planOf(profile);

  /* Nothing to say to somebody nobody coaches. The card appears the moment a
     plan is shared with them and not a screen before. */
  if (!plans?.length) return null;

  const openPlan = async (id: string) => {
    setOpenId(id);
    setOpen(await fetchPlan(id));
  };

  const apply = async () => {
    if (!open || !openId) return;
    setBusy(true);
    setFailed(false);
    try {
      await applySharedPlan(snap, open.plan, { id: openId, version: open.version });
      setOpen(null);
      setOpenId(null);
    } catch (err) {
      /* Installing a week is a dozen writes, and a sheet that simply closes on
         a half-written one would be the worst possible answer: the person walks
         to the gym believing their week changed. Say so and leave the sheet up. */
      console.error('[plans] could not apply', err);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const missing = open ? unresolvedExercises(open.plan, ix) : [];

  return (
    <Card className="flex flex-col gap-3">
      <section aria-label={tr.t('plan.shared')} className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold">{tr.t('plan.shared')}</h2>

        <div role="list" className="flex flex-col gap-1.5">
          {plans.map((p) => {
            const inEffect = applied?.id === p.id;
            const stale = inEffect && planIsStale(applied, p.version);
            return (
              <button
                key={p.id}
                type="button"
                role="listitem"
                onClick={() => void openPlan(p.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left',
                  inEffect
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-line)] bg-[var(--color-surface-2)]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {/* Said plainly rather than as a dot: "there is a newer one"
                        is the entire reason a version is stored at all. */}
                    {stale && (
                      <span className="shrink-0 rounded-full bg-[var(--color-accent-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-accent-ink)]">
                        {tr.t('plan.newVersion')}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-[var(--color-muted)]">
                    {p.ownerName
                      ? tr.count('plan.by', p.days, { name: p.ownerName })
                      : tr.count('plan.days', p.days)}
                  </div>
                </div>
                {inEffect && !stale && (
                  <span className="shrink-0 text-[11px] font-semibold text-[var(--color-accent)]">
                    {tr.t('set.inUse')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Presence>
        {open && (
          <Sheet
            title={open.plan.name}
            open
            onClose={() => {
              setOpen(null);
              setOpenId(null);
            }}
          >
            {open.plan.description && (
              <p className="text-sm leading-relaxed">{open.plan.description}</p>
            )}
            <p className="text-sm text-[var(--color-muted)]">
              {open.ownerName
                ? tr.count('plan.by', planSessions(open.plan), { name: open.ownerName })
                : tr.count('plan.days', planSessions(open.plan))}
            </p>

            {/* Said before applying, not discovered months later by noticing you
              have never once done the movement you were told to. */}
            {missing.length > 0 && (
              <Summary tone="idle">{tr.t('plan.missing', { list: missing.join(', ') })}</Summary>
            )}

            {/* The one consequence that matters, before the button: it replaces
              the week you train now. That it is then your own copy — offline,
              out of anybody else's reach — is one tap away. */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Summary tone="idle">{tr.t('plan.applyBody')}</Summary>
              </div>
              {/* Its own name, not "More on Use this plan": a name holding the
                button's would answer to the button's name too. */}
              <InfoTip label={tr.t('plan.applyWhat')} className="mr-1.5">
                {tr.t('plan.applyWhy')}
              </InfoTip>
            </div>

            {failed && <Summary tone="gap">{tr.t('plan.applyFailed')}</Summary>}

            <Button variant="primary" disabled={busy} onClick={() => void apply()}>
              {tr.t(applied?.id === openId ? 'plan.reapply' : 'plan.apply')}
            </Button>
          </Sheet>
        )}
      </Presence>
    </Card>
  );
}
