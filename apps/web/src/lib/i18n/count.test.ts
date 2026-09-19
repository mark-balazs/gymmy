import { describe, expect, it } from 'vitest';
import { LANG_CODES } from '@athletic/domain';
import { count } from './index';
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
    expect(count('fr', 'err.resetPending', 1)).toMatch(/^1 modification n'est /);
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
