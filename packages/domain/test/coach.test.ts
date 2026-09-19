import { describe, expect, it } from 'vitest';
import { buildProgram, lastSession, swapOptions, varietyFor } from '../src/coach';
import { SPLITS } from '../src/splits';
import { CATALOGUE, OFF_PLAN } from '../src/catalogue';
import { index, programCoverage, programRows, type Indexed } from '../src/model';
import { SCORED_PATTERNS, countsForIndex } from '../src/strength';
import { BIASES, type Bias, type PatternKey, type SplitKey, type Where } from '../src/types';
import { logsFor, seedIndex, seedSnapshot, withEntries } from './fixture';

/* Every preset, every legal day count, both locations, every bias — the same
   144 configurations the saturation figure in the docs was measured over. */
const configs = SPLITS.flatMap((s) =>
  Array.from({ length: s.maxDays - s.minDays + 1 }, (_, i) => s.minDays + i).flatMap((days) =>
    (['gym', 'home'] as const).flatMap((where) =>
      BIASES.map((bias) => ({
        split: s.key as Exclude<SplitKey, 'custom'>,
        days,
        where,
        bias,
      })),
    ),
  ),
);
/* Cached per (split, days), and the snapshot with it: `seedSnapshot` mints
   fresh ids on every call, so a draft checked against a *second* snapshot
   matches nothing and reports every pattern missing — which is how the first
   version of the coverage test below failed at variety zero. */
const built = new Map<string, { snap: ReturnType<typeof seedSnapshot>; ix: Indexed }>();
const at = (split: Exclude<SplitKey, 'custom'>, days: number) => {
  const key = `${split}:${days}`;
  if (!built.has(key)) {
    const s = seedSnapshot(split, days);
    built.set(key, { snap: s, ix: index(s) });
  }
  return built.get(key)!;
};
const ixFor = (split: Exclude<SplitKey, 'custom'>, days: number): Indexed => at(split, days).ix;
/** Setup's default answers: seven patterns, three days, a gym, no emphasis. */
const defaultWeek = configs.find(
  (c) => c.split === 'sevenPattern' && c.days === 3 && c.where === 'gym' && c.bias === 'none',
)!;
/** The week one configuration generates, installed so it reads back row by row. */
const weekOf = (c: (typeof configs)[number], variety: number): Indexed =>
  withEntries(
    at(c.split, c.days).snap,
    buildProgram(ixFor(c.split, c.days), {
      days: c.days,
      where: c.where,
      bias: c.bias,
      variety,
    }),
  );

describe('program generation', () => {
  const snap = seedSnapshot();

  describe('reach across the library', () => {
    const reachedWith = (variety: number): Set<string> => {
      const names = new Set<string>();
      for (const c of configs) {
        const cix = ixFor(c.split, c.days);
        for (const e of buildProgram(cix, {
          days: c.days,
          where: c.where,
          bias: c.bias,
          variety,
        })) {
          const ex = e.exerciseId ? cix.exerciseById.get(e.exerciseId) : null;
          if (ex) names.add(ex.name);
        }
      }
      return names;
    };
    const programmable = ixFor('sevenPattern', 3)
      .exercises.filter((e) => !e.tags.includes(OFF_PLAN))
      .map((e) => e.name);

    it('is unchanged at variety zero, which the demo and every fixture use', () => {
      /* A pin on the algorithm at zero, not on the library. It was 59 of 70 —
         the figure measured before variety existed — and became 68 of 85 when
         the conventional gaps were added, because a bigger pool is a different
         input rather than a different rule. Then 67, when each scored
         movement's main slot began to prefer a lift the index counts: that is
         a rule, and it moved the number. If it moves with no change to the
         library, the generator changed. The demo's specific week is pinned
         separately, by `demo-history.test.ts` and the e2e suite's named lifts. */
      expect(configs).toHaveLength(144);
      expect(reachedWith(0).size).toBe(67);
      // Omitting it is the same as zero.
      const cix = ixFor('sevenPattern', 3);
      expect(buildProgram(cix, { days: 3, where: 'gym', bias: 'none' })).toEqual(
        buildProgram(cix, { days: 3, where: 'gym', bias: 'none', variety: 0 }),
      );
    });

    it('reaches every programmable exercise across accounts', () => {
      /* The point of it. One account still reaches a subset — 58 to 72 of the
         85 programmable exercises over every value `varietyFor` can return,
         65 at the median — but different accounts reach different
         subsets, and between forty of them the whole library is programmed
         somewhere. Without the offset, the shared catalogue would have put every
         account on the same week. The machines included: a main slot prefers
         a lift the index counts, and the machines still reach the other slots. */
      const all = new Set<string>();
      for (let v = 0; v < 40; v++) for (const n of reachedWith(v)) all.add(n);
      expect(programmable.filter((n) => !all.has(n))).toEqual([]);
    });

    it('never costs a week its coverage, whatever the offset', () => {
      /* The whole method rests on covering all seven patterns. If an unlucky
         combination of days, equipment and bias could drop one, the app would
         be quietly failing at the only thing it claims to do — so every case
         is checked, on every preset.

         The offset only moves which exercise fills a slot, never which pattern
         the slot gets — so coverage has to hold for every variety, not just
         the one the other tests happen to exercise. And the layout itself is
         pinned, not just coverage: variety leaking into the pattern choice
         keeps the week covered, because the missing-pattern rule and the
         repair make up for it, and would pass a coverage check alone. */
      const layoutAt0 = new Map<string, string[]>();
      for (const v of [0, 1, 2, 3, 7, 13, 96, 500, 996]) {
        for (const c of configs) {
          const cix = ixFor(c.split, c.days);
          const draft = buildProgram(cix, {
            days: c.days,
            where: c.where,
            bias: c.bias,
            variety: v,
          });
          const week = withEntries(at(c.split, c.days).snap, draft);
          const missing = programCoverage(week, c.days).filter((m) => m.sets === 0);
          expect(
            missing.map((m) => `${v}:${c.split}:${c.days}:${c.where}:${m.pattern.key}`),
          ).toEqual([]);

          const layout = programRows(week, c.days).map(
            (r) => `${r.session}:${r.slot.key}:${r.pattern?.key}`,
          );
          const key = `${c.split}:${c.days}:${c.where}:${c.bias}`;
          if (v === 0) layoutAt0.set(key, layout);
          else expect(layout, `${v}:${key}`).toEqual(layoutAt0.get(key));
        }
      }
    });

    it('puts the bias on every isolation slot, in every configuration', () => {
      // The bias reaches the generator only through the isolation slot's tag, so
      // every isolation row is checked. "Some row carries the tag" passes for
      // shoulders and arms with no bias applied at all: the unbiased week
      // already has rows tagged with both.
      const off: string[] = [];
      for (const v of [0, 7, 500]) {
        for (const c of configs.filter((c) => c.bias !== 'none')) {
          const week = withEntries(
            at(c.split, c.days).snap,
            buildProgram(ixFor(c.split, c.days), {
              days: c.days,
              where: c.where,
              bias: c.bias,
              variety: v,
            }),
          );
          for (const r of programRows(week, c.days))
            if (r.slot.key === 'isolation' && !r.exercise?.tags.includes(c.bias))
              off.push(`${v}:${c.split}:${c.days}:${c.where}:${c.bias}:${r.exercise?.name}`);
        }
      }
      expect(off).toEqual([]);
    });

    it('never offers gym-only equipment to a home program', () => {
      // Every preset, day count and bias, not one three-day week: the home rule
      // has to hold wherever a pattern's home pool is thin.
      const gym: string[] = [];
      for (const v of [0, 7, 500])
        for (const c of configs.filter((c) => c.where === 'home')) {
          const week = withEntries(
            at(c.split, c.days).snap,
            buildProgram(ixFor(c.split, c.days), {
              days: c.days,
              where: 'home',
              bias: c.bias,
              variety: v,
            }),
          );
          for (const r of programRows(week, c.days))
            if (r.exercise?.where === 'gym')
              gym.push(`${v}:${c.split}:${c.days}:${c.bias}:${r.exercise.name}`);
        }
      expect(gym).toEqual([]);
    });

    it('derives the offset deterministically from the profile', () => {
      // The onboarding preview and the install both compute it; if it were not
      // a pure function of the row, the preview would show a different week.
      expect(varietyFor('profile-abc')).toBe(varietyFor('profile-abc'));
      expect(varietyFor(null)).toBe(0);
      expect(varietyFor(undefined)).toBe(0);
      expect(varietyFor('')).toBe(0);
      const spread = new Set(Array.from({ length: 50 }, (_, i) => varietyFor(`user-${i}`)));
      expect(spread.size).toBeGreaterThan(40);
    });
  });

  it('does not depend on pattern names, which are translated', () => {
    // Rename every pattern to its Hungarian equivalent. Generation must be
    // unaffected — matching on names would silently produce an empty week.
    const renamed = {
      ...snap,
      patterns: snap.patterns.map((p) => ({ ...p, name: `HU-${p.key}` })),
    };
    const draft = buildProgram(index(renamed), { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(renamed, draft);
    expect(programCoverage(built, 3).filter((c) => c.sets === 0)).toEqual([]);

    // …including a split whose slots are pinned by pattern key, which is where a
    // key/name mix-up would bite: the seven-pattern week has no pinned slot.
    const ppl = seedSnapshot('pushPullLegs', 3);
    const pplRenamed = {
      ...ppl,
      patterns: ppl.patterns.map((p) => ({ ...p, name: `HU-${p.key}` })),
    };
    const pplBuilt = withEntries(
      pplRenamed,
      buildProgram(index(pplRenamed), { days: 3, where: 'gym', bias: 'none' }),
    );
    expect(programCoverage(pplBuilt, 3).filter((c) => c.sets === 0)).toEqual([]);
    expect(programRows(pplBuilt, 3).filter((r) => r.check.ok === false)).toEqual([]);
  });
});

describe('a lift the strength index counts', () => {
  /* The index counts only real weights, plus pull-ups, chin-ups and dips at
     bodyweight (D-022). Left to the pool order, 41% of generated weeks — 65% of
     seven-pattern gym weeks — gave a movement the person trains nothing but a
     machine or a push-up, and so a zero in the index for it. The owner's
     decision (2026-09-19): keep the rule, and have each scored movement's main
     slot, its first in the week, prefer a lift that counts. */
  const varieties = Array.from({ length: 91 }, (_, i) => i * 11);

  /** For each scored movement in the week: its first row, in week order. */
  const mainRows = (week: Indexed, days: number) => {
    const out = new Map<PatternKey, ReturnType<typeof programRows>[number]>();
    for (const r of programRows(week, days)) {
      const key = r.pattern?.key;
      if (key && SCORED_PATTERNS.includes(key) && !out.has(key)) out.set(key, r);
    }
    return out;
  };

  it('gives every scored movement one in its main slot, in every configuration', () => {
    /* Every preset, day count, location and bias, at a spread of offsets
       across all 997 values `varietyFor` returns — 13,104 weeks. Every scored
       movement's pool has a lift that counts, at home as at the gym, so every
       main slot must hold one. */
    const missed: string[] = [];
    for (const v of varieties)
      for (const c of configs) {
        const week = weekOf(c, v);
        for (const [key, r] of mainRows(week, c.days))
          if (!countsForIndex(r.exercise!.name))
            missed.push(
              `${v}:${c.split}:${c.days}:${c.where}:${c.bias}:${key}:${r.exercise!.name}`,
            );
      }
    expect(missed.slice(0, 5)).toEqual([]);
  });

  it('changes nothing where the pick already counted', () => {
    /* Walked forward from the pick rather than re-picked from the lifts that
       count, so a week with nothing to fix keeps every lift — the demo's and
       the e2e fixture's among them, which name theirs. The seven-pattern gym
       week at variety zero opened every movement on a lift that counts.
       Coverage, the layout and the location are held for every configuration
       by the tests above, which the preference runs under. */
    const names = programRows(weekOf(defaultWeek, 0), 3).map((r) => r.exercise?.name);
    expect(names).toEqual([
      'Goblet Squat',
      'Barbell Bench Press',
      'Trap Bar Deadlift',
      'Hammer Curl',
      'Russian Twist',
      'Reverse Lunge',
      'Chin-Up',
      'Overhead Carry',
      'Overhead Tricep Extension',
      "Waiter's Walk",
      'Step-Up',
      'Barbell Row',
      'Chest-Supported Row',
      'Leg Curl',
      'Side Plank',
    ]);
  });

  it('still puts the machines in the week, in the other slots', () => {
    /* "Machines go to the other slots", not out of the library. An upper/lower
       week trains squat twice: the first squat counts, and the second is free
       to be a Leg Press or a Hack Squat. Across accounts, every machine the
       generator may program is still programmed somewhere. */
    const machines = CATALOGUE.filter(
      (c) =>
        SCORED_PATTERNS.includes(c.pattern) &&
        !c.tags.includes(OFF_PLAN) &&
        !countsForIndex(c.name),
    ).map((c) => c.name);
    expect(machines.length).toBeGreaterThan(10);
    const seen = new Set<string>();
    for (let v = 0; v < 40; v++)
      for (const c of configs)
        for (const r of programRows(weekOf(c, v), c.days))
          if (r.exercise) seen.add(r.exercise.name);
    expect(machines.filter((n) => !seen.has(n))).toEqual([]);
  });

  it('falls back to the pool as it is when nothing in it counts', () => {
    /* A pool with no lift that counts — every real-weight squat taken out of
       the library here — keeps its squat rather than losing the slot: the
       week still covers squat, with whatever the pool has. */
    const realSquats = CATALOGUE.filter((c) => c.pattern === 'squat' && countsForIndex(c.name));
    const catalogue = CATALOGUE.map((c) =>
      realSquats.includes(c) ? { ...c, tags: [...c.tags, OFF_PLAN] } : c,
    );
    const s = seedSnapshot('sevenPattern', 3);
    for (const v of [0, 1, 2, 3]) {
      const week = withEntries(
        s,
        buildProgram(index(s, catalogue), { days: 3, where: 'gym', bias: 'none', variety: v }),
        catalogue,
      );
      const squats = programRows(week, 3).filter((r) => r.pattern?.key === 'squat');
      expect(squats.length).toBeGreaterThan(0);
      expect(squats.every((r) => r.exercise && !countsForIndex(r.exercise.name))).toBe(true);
      expect(programCoverage(week, 3).filter((m) => m.sets === 0)).toEqual([]);
    }
  });
});

describe('the swap sheet', () => {
  it('offers only legal swaps: like-for-like on a free slot, the role on a role slot, nothing gym-only at home', () => {
    /* A swap must not be able to undo what the generator guaranteed. A free
       slot offering any pattern would let one tap cost the week its coverage,
       and a home swap offering a barbell would hand somebody equipment they
       said they do not have. The only other swap test is a pinned gym slot. */
    const snap = seedSnapshot('sevenPattern', 3);
    for (const where of ['gym', 'home'] as const) {
      const built = withEntries(snap, buildProgram(index(snap), { days: 3, where, bias: 'none' }));
      for (const r of programRows(built, 3).filter((r) => r.session === 0)) {
        const opts = swapOptions(built, 3, 0, r.slot.id, where);
        expect(opts.length, `${where}/${r.slot.key}`).toBeGreaterThan(0);
        if (r.slot.requiredRole === 'Any')
          expect(opts.every((o) => o.patternId === r.exercise!.patternId)).toBe(true);
        else
          expect(
            opts.every((o) => built.patternById.get(o.patternId)?.role === r.slot.requiredRole),
          ).toBe(true);
        if (where === 'home')
          expect(opts.filter((o) => o.where === 'gym').map((o) => o.name)).toEqual([]);
      }
    }
  });
});

describe('movements the app records but never prescribes', () => {
  /* The library is gaining conditioning work so a CrossFit class can be logged
     at all. Every one of those is fine to have done and poor to be handed: a
     generated slot asks for three sets of six to twelve, which is not what
     anybody does with a medicine ball, and a week built out of them reads as a
     programme nobody wrote.

     Every test here tags **the exercise the generator actually chose**, read
     back from an untagged run, rather than tagging a pool and asserting the
     survivor. The first version did the latter and passed with the guard
     switched off: the generator picks a squat pool by an index that barely
     moves, so it was choosing Goblet Squat either way and the test was
     agreeing with a coincidence. */
  const base = seedSnapshot();
  const plain = index(base);

  const chosenFor = (
    ix: Indexed,
    key: PatternKey,
    opts: { where: Where; bias: Bias; days: number },
  ) => {
    const patternId = ix.patterns.find((p) => p.key === key)!.id;
    return buildProgram(ix, opts)
      .map((d) => (d.exerciseId ? ix.exerciseById.get(d.exerciseId) : null))
      .filter((e): e is NonNullable<typeof e> => !!e && e.patternId === patternId);
  };

  /** The catalogue with `names` marked off-plan. Tags live in the catalogue
   *  now, not on an account's rows — tagging a row would do nothing at all. */
  const offPlanCatalogue = (names: string[]) =>
    CATALOGUE.map((c) => (names.includes(c.name) ? { ...c, tags: [...c.tags, OFF_PLAN] } : c));
  const tagging = (names: string[]) => index(base, offPlanCatalogue(names));

  it('picks something else once the movement it wanted is off-plan', () => {
    for (const days of [2, 3, 4]) {
      // A snapshot with slots for this many days: the default one has three,
      // so a fourth day built on it is empty and was never checked.
      const b = seedSnapshot('sevenPattern', days);
      const opts = { days, where: 'gym' as const, bias: 'none' as const };
      const before = chosenFor(index(b), 'squat', opts);
      expect(before.length).toBeGreaterThan(0);

      const banned = [...new Set(before.map((e) => e.name))];
      const after = chosenFor(index(b, offPlanCatalogue(banned)), 'squat', opts);

      // Still a squat in the week, and not one of the ones we just refused.
      expect(after.length).toBe(before.length);
      expect(after.some((e) => banned.includes(e.name))).toBe(false);

      // And the week is still covered without them: the guard must not be able
      // to leave a pattern uncovered, nor to look covered by an exercise the
      // generator would never choose.
      const week = withEntries(
        b,
        buildProgram(index(b, offPlanCatalogue(banned)), opts),
        offPlanCatalogue(banned),
      );
      expect(programCoverage(week, days).filter((c) => c.sets === 0)).toEqual([]);
    }
  });

  it('does not let a bias fallback smuggle one back in', () => {
    /* `choose` falls back to an untagged pool whenever a bias leaves the
       isolation pool empty, and that second call is exactly where an off-plan
       movement would reappear — for the user who asked for a bias, which is
       nobody's idea of a guard. So the filter sits in `pool`'s base rather than
       in its tag argument.

       Banning every isolation movement that carries the bias makes that
       fallback the path actually taken. Banning squats, as this test first
       did, never reached it: only the isolation slot is ever given a tag. */
    for (const bias of BIASES.filter((b) => b !== 'none')) {
      const banned = CATALOGUE.filter(
        (c) => c.pattern === 'isolation' && c.tags.includes(bias),
      ).map((c) => c.name);
      const ix = tagging(banned);
      for (const where of ['gym', 'home'] as const)
        for (let variety = 0; variety < 10; variety++) {
          const smuggled = buildProgram(ix, { days: 3, where, bias, variety })
            .map((d) => (d.exerciseId ? ix.exerciseById.get(d.exerciseId)?.name : undefined))
            .filter((n): n is string => !!n && banned.includes(n));
          expect(smuggled, `${bias}/${where}/${variety}`).toEqual([]);
        }
    }
  });

  it('stops offering one as a swap for a planned slot', () => {
    const draft = buildProgram(plain, { days: 3, where: 'gym', bias: 'none' });
    const built = withEntries(base, draft);
    const row = programRows(built, 3).find((r) => r.pattern?.key === 'squat')!;

    const before = swapOptions(built, 3, row.session, row.slot.id, 'gym');
    const victim = before.find((e) => e.name !== row.exercise?.name)!;
    expect(victim).toBeDefined();

    const taggedIx = tagging([victim.name]);
    const builtTagged = withEntries(
      base,
      buildProgram(taggedIx, { days: 3, where: 'gym', bias: 'none' }),
      offPlanCatalogue([victim.name]),
    );
    const rowTagged = programRows(builtTagged, 3).find((r) => r.pattern?.key === 'squat')!;
    const after = swapOptions(builtTagged, 3, rowTagged.session, rowTagged.slot.id, 'gym');

    expect(before.map((e) => e.name)).toContain(victim.name);
    expect(after.map((e) => e.name)).not.toContain(victim.name);
  });
});

describe('what you did last time', () => {
  /* The replacement for a double-progression engine that handed out targets.
     Everything here is a question about the past, and there is deliberately no
     test asserting what to do next — that is the point of the change, and a
     test named "suggests more weight" reappearing here would undo it. */
  const base = seedSnapshot();
  const squat = index(base).exercises.find((e) => e.name === 'Goblet Squat')!;

  const withLogs = (sets: { weight: number; reps: number; rir: number }[], date?: string) =>
    index({ ...base, logs: logsFor(squat.id, sets, date) });

  it('has nothing to say about a lift never trained', () => {
    // Not a zero and not a starting weight to aim at. Nothing.
    expect(lastSession(index(base), squat.id)).toBeNull();

    // …even when other lifts have history. This prefills the Train card, so a
    // leak here is a squat card handed the bench weight.
    const bench = index(base).exercises.find((e) => e.name === 'Barbell Bench Press')!;
    expect(
      lastSession(
        index({ ...base, logs: logsFor(bench.id, [{ weight: 80, reps: 5, rir: 1 }]) }),
        squat.id,
      ),
    ).toBeNull();
  });

  it('reports the heaviest weight of the most recent session', () => {
    const ix = index({
      ...base,
      logs: [
        ...logsFor(squat.id, [{ weight: 80, reps: 5, rir: 0 }], '2026-08-01'),
        ...logsFor(squat.id, [{ weight: 60, reps: 8, rir: 2 }], '2026-09-10'),
      ],
    });
    const last = lastSession(ix, squat.id);
    // The recent session, not the best one — this is history, not a record book.
    expect(last).toEqual({ date: '2026-09-10', weight: 60, reps: 8 });
  });

  it('takes the fewest reps at the top weight, not the easiest set', () => {
    /* A session of 60×10, 60×8, 50×12 is repeated as 60×8. The max reps would
       flatter the session and the back-off set is not what you would repeat.
       Nor is the warm-up: 40×3 has the fewest reps of all, and without it the
       fewest reps overall and the fewest at the top weight were the same set. */
    const last = lastSession(
      withLogs([
        { weight: 40, reps: 3, rir: 5 },
        { weight: 60, reps: 10, rir: 2 },
        { weight: 60, reps: 8, rir: 0 },
        { weight: 50, reps: 12, rir: 2 },
      ]),
      squat.id,
    );
    expect(last).toMatchObject({ weight: 60, reps: 8 });
  });

  it('takes the fewest reps at the top weight wherever it falls in the session', () => {
    // The hard set first and an easier one after it: "the last set" and "the
    // working set" disagree, and only the second is what you would repeat.
    const last = lastSession(
      withLogs([
        { weight: 60, reps: 8, rir: 0 },
        { weight: 60, reps: 10, rir: 2 },
      ]),
      squat.id,
    );
    expect(last).toMatchObject({ weight: 60, reps: 8 });
  });

  it('survives a set logged without a weight', () => {
    // Bodyweight work, or a set somebody half-filled in. Neither should throw
    // and neither should invent a number.
    const last = lastSession(withLogs([{ weight: 0, reps: 12, rir: 2 }]), squat.id);
    expect(last?.weight).toBeNull();
    expect(last?.reps).toBe(12);
  });

  it('finds the latest session without relying on the logs being sorted', () => {
    /* IndexedDB hands rows back in UUID order, so "the last session" cannot be
       "the last row". `index()` does sort, which means a test going through it
       cannot tell whether this function is order-independent on its own — it
       would need both to break before it failed. So the index is built and then
       its logs are deliberately scrambled, bypassing that sort.

       It matters because this is what prefills the weight on the Train card. A
       wrong answer here is not a wrong chart; it is somebody being handed a
       heavier bar than they lifted last time, which is the exact class of
       mistake this whole change exists to remove. */
    const ordered = [
      ...logsFor(squat.id, [{ weight: 50, reps: 8, rir: 2 }], '2026-07-01'),
      ...logsFor(squat.id, [{ weight: 70, reps: 6, rir: 1 }], '2026-09-01'),
    ];
    const unsorted: Indexed = {
      ...index({ ...base, logs: ordered }),
      logs: [...ordered].reverse(),
    };
    expect(lastSession(unsorted, squat.id)).toEqual({ date: '2026-09-01', weight: 70, reps: 6 });
  });
});
