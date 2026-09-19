import { describe, expect, it } from 'vitest';
import { TABS, directionOf, historyFor, isTabRoot, parentOf, placeOf } from './tabs';

/**
 * Where each screen sits, which way a move to it slides, and what the move
 * does to the browser's history (GYM-15, GYM-16).
 *
 * The browser half — that a Back really leaves the app, that a link really
 * slides — is `navigation.spec.ts`. These hold the rules themselves, which a
 * browser test can only sample.
 */

describe('the tabs', () => {
  it('are the five, in the order of the bar', () => {
    expect(TABS.map((t) => t.href)).toEqual(['/home', '/train', '/week', '/progress', '/settings']);
  });

  it('know which screens live inside which tab', () => {
    expect(placeOf('/week')).toEqual({ tab: 2, depth: 0 });
    expect(placeOf('/settings/split')).toEqual({ tab: 4, depth: 1 });
    // Reached from Settings, and Back lands there, though the path says otherwise.
    expect(placeOf('/coach')).toEqual({ tab: 4, depth: 1 });
    expect(parentOf('/coach')).toBe('/settings');
    expect(placeOf('/onboarding')).toBeNull();
    expect(placeOf('/sign-in')).toBeNull();
    expect(isTabRoot('/settings')).toBe(true);
    expect(isTabRoot('/settings/split')).toBe(false);
  });
});

describe('which way a move slides', () => {
  it('between tabs, by their order on the bar', () => {
    expect(directionOf('/home', '/train')).toBe('nav-forward');
    expect(directionOf('/home', '/week')).toBe('nav-forward');
    expect(directionOf('/week', '/train')).toBe('nav-back');
    expect(directionOf('/train', '/settings')).toBe('nav-forward');
  });

  it('into a screen is forward, out of it is back', () => {
    expect(directionOf('/settings', '/settings/split')).toBe('nav-forward');
    expect(directionOf('/settings/split', '/settings')).toBe('nav-back');
    expect(directionOf('/settings', '/coach')).toBe('nav-forward');
    expect(directionOf('/coach', '/settings')).toBe('nav-back');
  });

  it('out of a screen to another tab, by the tabs', () => {
    // The split editor saves and shows the week it built.
    expect(directionOf('/settings/split', '/week')).toBe('nav-back');
    expect(directionOf('/coach', '/home')).toBe('nav-back');
  });

  it('nowhere, for no move or one outside the app', () => {
    expect(directionOf('/train', '/train')).toBeNull();
    expect(directionOf('/onboarding', '/train')).toBeNull();
    expect(directionOf('/train', '/sign-in')).toBeNull();
  });
});

describe('what a move does to the history', () => {
  it('replaces the entry between tabs, so Back never walks tab to tab', () => {
    expect(historyFor('/train', '/week', false)).toBe('replace');
    expect(historyFor('/home', '/settings', false)).toBe('replace');
  });

  it('adds an entry going into a screen, so Back comes out of it', () => {
    expect(historyFor('/settings', '/settings/split', false)).toBe('push');
    expect(historyFor('/settings', '/coach', false)).toBe('push');
  });

  it('steps back out of a screen this load opened, wherever it is going', () => {
    expect(historyFor('/settings/split', '/settings', true)).toBe('back');
    expect(historyFor('/settings/split', '/week', true)).toBe('back');
    expect(historyFor('/coach', '/train', true)).toBe('back');
  });

  it('replaces instead when nothing says what is under the screen', () => {
    // A reload, or a link from outside: stepping back could leave the app.
    expect(historyFor('/settings/split', '/settings', false)).toBe('replace');
    expect(historyFor('/settings/split', '/week', false)).toBe('replace');
  });
});
