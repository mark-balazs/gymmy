import { describe, expect, it } from 'vitest';
import { LANG_CODES } from '@athletic/domain';
import { count, translate, type CountKey } from './index';
import { dicts, en } from './dict';

/**
 * A sentence with a number in it takes the form that number needs.
 *
 * The reset warning said "1 changes have not synced yet" — on the one screen
 * that warns about losing data. Its forms are checked in every language,
 * because each gets it wrong differently: English and Spanish need a singular
 * noun and verb, German a singular verb too, French counts 0 as singular, and
 * Hungarian takes no plural after a numeral at all.
 */

describe('count', () => {
  it('writes one change in the singular and several in the plural', () => {
    expect(count('en', 'err.resetPending', 1)).toBe(
      '1 change has not synced yet and would be lost.',
    );
    expect(count('en', 'err.resetPending', 3)).toBe(
      '3 changes have not synced yet and would be lost.',
    );
    expect(count('de', 'err.resetPending', 1)).toMatch(/^1 Änderung ist /);
    expect(count('de', 'err.resetPending', 2)).toMatch(/^2 Änderungen sind /);
    expect(count('es', 'err.resetPending', 1)).toBe(
      'Hay 1 cambio sin sincronizar que se perdería.',
    );
    expect(count('es', 'err.resetPending', 2)).toMatch(/^Hay 2 cambios /);
    expect(count('fr', 'err.resetPending', 1)).toMatch(/^1 modification n’est /);
    expect(count('fr', 'err.resetPending', 2)).toMatch(/^2 modifications ne sont /);
  });

  it('keeps the noun singular after a Hungarian numeral', () => {
    expect(count('hu', 'err.resetPending', 1)).toMatch(/^1 változás /);
    expect(count('hu', 'err.resetPending', 5)).toMatch(/^5 változás /);
  });

  it('agrees the verb with one waiting change, where the language has to', () => {
    expect(count('de', 'sync.pending', 1)).toBe('1 wartet auf Sync');
    expect(count('de', 'sync.pending', 4)).toBe('4 warten auf Sync');
    expect(count('es', 'sync.pending', 1)).toBe('1 pendiente de sincronizar');
    expect(count('es', 'sync.pending', 4)).toBe('4 pendientes de sincronizar');
  });

  it('says one of anything in the singular, wherever a count is shown', () => {
    /* Every one of these printed "1 sets", "1 days left", "1 people" — the
       count() route existed, and they had never been moved onto it. */
    const one: [CountKey, Record<string, string>, string][] = [
      ['cal.dayTrained', { day: 'Monday 1 June' }, 'Monday 1 June — 1 set'],
      ['week.gaps', { list: 'carry' }, '1 gap: carry.'],
      ['week.complete', { s: '1 session' }, 'Complete week: 1 of 1 covered in 1 session.'],
      ['goal.daysLeft', {}, '1 day left'],
      ['goal.weeksN', {}, '1 week'],
      ['goal.tooShort', {}, 'Give it at least 1 week.'],
      ['prog.cellSets', {}, '1 set'],
      ['prog.cellNotAsked', {}, '1 set — not part of your split that week'],
      ['prog.agoWeeks', {}, '1 week ago'],
      ['prog.window', {}, 'Last 1 week'],
      ['coach.members', {}, '1 person'],
      ['sub.daysPerWeek', {}, '1 day a week'],
      ['plan.days', {}, '1 day a week'],
      ['plan.by', { name: 'Ana' }, 'By Ana · 1 day a week'],
      ['split.minDays', {}, 'At least 1 day a week'],
      ['train.ofSets', { done: '0' }, '0 of 1 set'],
      ['home.continue', { done: '1' }, 'Continue — 1 of 1 set'],
      ['home.covered', { hit: '1' }, '1 of 1 movement covered'],
      ['set.deleteSets', {}, '1 logged set'],
      ['set.deleteWeeks', {}, '1 week'],
    ];
    /* The whole sentence, not a part of it: "1 set" is inside "1 sets", so a
       containment check passed eight of these rows in the plural too. */
    for (const [stem, params, want] of one) {
      expect(count('en', stem, 1, params), stem).toBe(want);
    }
    // And the plural is still the plural.
    expect(count('en', 'coach.members', 3)).toBe('3 people');
    expect(count('en', 'goal.daysLeft', 0)).toBe('0 days left');
    // Where the verb or the ending agrees too.
    expect(count('de', 'goal.daysLeft', 1)).toBe('Noch 1 Tag');
    expect(count('es', 'goal.daysLeft', 1)).toBe('Queda 1 día');
    expect(count('es', 'goal.daysLeft', 2)).toBe('Quedan 2 días');
    // French counts nothing left as one day, as it counts 0 as one of anything.
    expect(count('fr', 'goal.daysLeft', 0)).toBe('0 jour restant');
    expect(count('fr', 'goal.daysLeft', 2)).toBe('2 jours restants');
    expect(count('hu', 'coach.members', 3)).toBe('3 fő');
  });

  it('builds a sentence with two counts from two counted pieces', () => {
    /* "This deletes 12 logged sets across 1 weeks of training" — the most
       likely account to be deleted is a new one, with one week in it. */
    const deleting = (lang: (typeof LANG_CODES)[number], sets: number, weeks: number) =>
      translate(lang, 'set.deleteWhat', {
        sets: count(lang, 'set.deleteSets', sets),
        weeks: count(lang, 'set.deleteWeeks', weeks),
      });
    expect(deleting('en', 12, 1)).toBe('This deletes 12 logged sets across 1 week of training.');
    expect(deleting('en', 1, 1)).toBe('This deletes 1 logged set across 1 week of training.');
    expect(deleting('en', 2, 2)).toBe('This deletes 2 logged sets across 2 weeks of training.');
    expect(deleting('de', 1, 1)).toBe('Damit löschst du 1 erfassten Satz aus 1 Trainingswoche.');
    expect(deleting('de', 5, 2)).toBe('Damit löschst du 5 erfasste Sätze aus 2 Trainingswochen.');
    expect(deleting('es', 1, 1)).toBe(
      'Esto elimina 1 serie registrada de 1 semana de entrenamiento.',
    );
    expect(deleting('fr', 0, 0)).toBe(
      'Cela supprime 0 série enregistrée sur 0 semaine d’entraînement.',
    );
    expect(deleting('hu', 12, 3)).toBe('Ezzel 12 rögzített sorozat törlődik, 3 hétnyi edzésből.');
  });

  it('leaves no count in a key that does not go through count()', () => {
    /* The guard for the rule itself. A plain key holding a number is either
       a name, an ordinal or an amount with its unit — which never take a
       plural — or it is a count waiting to print "1 things". Each exception
       below says which it is; a new plain key with a number fails here until
       somebody decides. "A number" means the placeholders that carry counts
       in this dictionary — a new name for one would slip past. */
    const notCounts: Record<string, string> = {
      'common.day': 'a name: Day A',
      'common.week': 'a name: Week 3',
      'train.logSet': 'an ordinal: Log set 2',
      'train.saveSet': 'an ordinal: Save set 2',
      'coach.published': 'a name: Version 2',
      'goal.nowAt': 'an amount with its unit: 60 kg',
      'goal.partly': 'an amount with its unit',
      'goal.tooSmall': 'an amount with its unit',
      'prog.dotsFrom': 'an amount with its unit',
      'train.rowDone': 'no noun: 2 of 3 done',
      'set.deleteWhat': 'its counts arrive counted: set.deleteSets, set.deleteWeeks',
    };
    const numeric = /\{(n|total|done|hit|sets|weeks)\}/;
    const plain = Object.entries(en as Record<string, string>)
      .filter(([k, v]) => !/\.(one|other)$/.test(k) && numeric.test(v))
      .map(([k]) => k);
    expect(plain.filter((k) => !(k in notCounts))).toEqual([]);
    // And no exception outlives its key.
    expect(Object.keys(notCounts).filter((k) => !plain.includes(k))).toEqual([]);
  });

  it('has both forms of every counted sentence in every language', () => {
    /* The type only admits a stem with both halves, and every locale must hold
       every key — so this is the runtime view of what the compiler holds: no
       half-written pair can reach a screen. */
    const stems = Object.keys(en)
      .filter((k) => k.endsWith('.one'))
      .map((k) => k.slice(0, -'.one'.length));
    expect(stems).toContain('err.resetPending');
    for (const lang of LANG_CODES) {
      for (const stem of stems) {
        const dict = dicts[lang] as Record<string, string>;
        expect(dict[`${stem}.one`], `${lang} ${stem}.one`).toContain('{n}');
        expect(dict[`${stem}.other`], `${lang} ${stem}.other`).toContain('{n}');
      }
    }
  });
});
