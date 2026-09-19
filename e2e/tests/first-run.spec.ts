/** Flow 01 — see ../flows/01-first-run.md */

import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { CATALOGUE } from '../../packages/domain/src/catalogue';
import { buildProgram, varietyFor } from '../../packages/domain/src/coach';
import { index } from '../../packages/domain/src/model';
import { SEED_PATTERNS } from '../../packages/domain/src/seed';
import { buildSlots, findSplit } from '../../packages/domain/src/splits';
import type { Snapshot } from '../../packages/domain/src/types';
import { createUser, installedWeek, sessionCookie, thisMonday } from '../fixtures/auth';
import { completeOnboarding, expect, logSet, recordedSet, test } from '../fixtures/test';

/**
 * The week setup installs for an account with this id, as `day:slot` → exercise
 * id — built by the generator exactly as setup builds it for the default
 * answers (seven patterns, three days, a gym, no emphasis).
 */
function weekFor(accountId: string, variety: number): Record<string, string> {
  const preset = findSplit('sevenPattern')!;
  const stamp = new Date().toISOString();
  const meta = { updatedAt: stamp, deletedAt: null };
  const slots = buildSlots(preset, 3).map((s, i) => ({ ...meta, ...s, id: `slot-${i}` }));
  const snap: Snapshot = {
    patterns: SEED_PATTERNS.map((p, i) => ({
      ...meta,
      id: `${accountId}-${p.key}`,
      key: p.key,
      name: p.key,
      role: p.role,
      counts: p.counts,
      position: i,
    })),
    slots,
    exercises: [],
    splitPeriods: [
      {
        ...meta,
        id: 'period',
        split: preset.key,
        days: 3,
        startWeek: thisMonday(),
        patternKeys: [...preset.covers],
      },
    ],
    entries: [],
    logs: [],
    bodyLogs: [],
    goals: [],
    profile: null,
  };
  const position = new Map(slots.map((s) => [s.id, s.position]));
  const out: Record<string, string> = {};
  for (const e of buildProgram(index(snap), { days: 3, where: 'gym', bias: 'none', variety }))
    if (e.exerciseId) out[`${e.sessionIndex}:${position.get(e.slotId)}`] = e.exerciseId;
  return out;
}

/** The lift Train opens on for a new account with this id: Day A's first slot. */
const openingLift = (accountId: string): string =>
  CATALOGUE.find((c) => c.id === weekFor(accountId, varietyFor(accountId))['0:0'])!.name;

/** The exercises the setup preview lists under one day's card. */
const previewOf = (page: Page, day: string) =>
  page
    .locator('h3', { hasText: new RegExp(`^Day ${day}$`) })
    .locator('xpath=../following-sibling::div[1]')
    .locator('span.truncate');

/** The exercises the Week tab lists under one day, by their "About" buttons. */
const weekDay = (page: Page, day: string) =>
  page
    .locator('h3')
    .filter({ hasText: new RegExp(`^Day ${day}`) })
    .locator('xpath=ancestor::div[2]')
    .getByRole('button', { name: /^About / });

test.describe('First run', () => {
  test('five questions produce a complete week', async ({ app }) => {
    await app.goto('/train');
    // Not onboarded, so the app redirects rather than showing an empty plan.
    await app.waitForURL('**/onboarding');

    // The split comes first: it decides which day counts the next step offers.
    await expect(
      app.getByRole('heading', { name: 'How should your week be shaped?' }),
    ).toBeVisible();
    /* One short line per option, and it is true: push/pull/legs used to
       promise it was "still checked for carries and rotation", which its
       complete week does not ask for. */
    await expect(app.getByText('You can change this later.', { exact: true })).toBeVisible();
    await expect(
      app.getByRole('button', { name: 'Push / Pull / Legs. A day each for push, pull and legs' }),
    ).toBeVisible();
    await app.getByRole('button').filter({ hasText: 'Seven movement patterns' }).first().click();

    await expect(app.getByRole('heading', { name: 'How often can you train?' })).toBeVisible();
    // Hints only where they change the answer: two still covers everything,
    // three is the nudge for the unsure; four says nothing more than "4 days".
    await expect(
      app.getByRole('button', { name: '3 days a week. Recommended', exact: true }),
    ).toBeVisible();
    await expect(app.getByRole('button', { name: '4 days a week', exact: true })).toBeVisible();
    await app.getByRole('button', { name: /^3 days/ }).click();

    await expect(app.getByRole('heading', { name: 'Where do you train?' })).toBeVisible();
    // The equipment line under each answer is the whole explanation.
    await expect(app.getByText('Barbells, machines, cables')).toBeVisible();
    await app.getByRole('button', { name: /^A gym/ }).click();

    await expect(app.getByRole('heading', { name: /Anything you want to bring up/ })).toBeVisible();
    await app.getByRole('button', { name: /^Shoulders/ }).click();

    /* And bodyweight, which is the difference between having a strength
       score and not having one — it is a ratio, so without this the number
       is null and the page can only say so. */
    await expect(app.getByRole('heading', { name: 'What do you weigh?' })).toBeVisible();
    /* The unit beside the box, read out with it: the number is stored as
       typed, and someone who thinks in pounds would otherwise type 170. */
    await expect(app.getByLabel('What do you weigh?')).toHaveAccessibleDescription('kg');
    await app.getByLabel('What do you weigh?').fill('78.5');
    await app.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(app.getByRole('heading', { name: 'Here is your week' })).toBeVisible();
    await expect(app.getByText('You can swap any exercise later.', { exact: true })).toBeVisible();
    /* Three days, lettered, and five exercises apiece — what the flow promises.
       Counted rather than probed for a fourth: days are lettered, so the check
       this replaced, for a heading called "Day 4", could never find one
       whatever rendered. The only heading here shaped like a day is a day's
       card, and at a gym every slot fills. */
    await expect(app.getByRole('heading', { name: /^Day [A-Z]$/ })).toHaveCount(3);
    for (const d of ['A', 'B', 'C']) {
      await expect(previewOf(app, d)).toHaveCount(5);
    }

    await app.getByRole('button', { name: 'Start training' }).click();
    await app.waitForURL('**/train');
    await expect(app.getByRole('heading', { name: 'Train' })).toBeVisible();
  });

  test('installs exactly the week it previewed', async ({ app }) => {
    /* The preview and the install each build the week themselves, and each
       derives the account's offset into the library from the profile row. If
       they ever disagreed — one reading a different row, or seeding from a slot
       id, the clock or randomness — setup would show one week and hand over
       another, and nothing else would notice. Found missing by review: the
       offset was only ever tested by calling the generator directly.

       With a bias, because it is the one answer that acts only in the
       isolation slot: with none, preview and install cannot disagree about it,
       so a bias lost on the way to the install passed. And every day, not just
       the first — the bias moves Day A's isolation slot on only some accounts,
       while across the whole week it shows on every one. */
    await app.goto('/onboarding');
    await app.getByRole('button').filter({ hasText: 'Seven movement patterns' }).first().click();
    await app.getByRole('button', { name: /^3 days/ }).click();
    await app.getByRole('button', { name: /^A gym/ }).click();
    await app.getByRole('button', { name: /^Shoulders/ }).click();
    await app.getByLabel('What do you weigh?').fill('78.5');
    await app.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(app.getByRole('heading', { name: 'Here is your week' })).toBeVisible();

    const previewed: Record<string, string[]> = {};
    for (const d of ['A', 'B', 'C']) {
      previewed[d] = await previewOf(app, d).allInnerTexts();
      expect(previewed[d]!.length).toBeGreaterThan(0);
    }

    await app.getByRole('button', { name: 'Start training' }).click();
    await app.waitForURL('**/train');
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    for (const d of ['A', 'B', 'C']) {
      // Waited for, and counted: `evaluateAll` does not wait, and the week
      // renders a tick after the page does — the first version read an empty
      // list here.
      await expect(weekDay(app, d)).toHaveCount(previewed[d]!.length);
      const labels = await weekDay(app, d).evaluateAll((els) =>
        els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^About /, '')),
      );
      expect(labels, `Day ${d}`).toEqual(previewed[d]);
    }
  });

  test('each account gets its own week', async ({ page, context, baseURL }) => {
    /* Two accounts that answer setup the same way get different exercises: an
       offset into the library, derived from the account. The generator's half
       of that is unit-tested; what nothing held is that setup passes it. With
       the offset dropped from both the preview and the install, they still
       agree with each other — so the test above stays green — and every new
       account is handed the same week.

       So the account's id is chosen here, one whose offset is known to change
       the week, and the week the server ends up holding is compared with the
       one the generator makes for that id. */
    let id = '';
    for (let i = 0; i < 50 && !id; i++) {
      const candidate = randomUUID();
      const own = weekFor(candidate, varietyFor(candidate));
      if (JSON.stringify(own) !== JSON.stringify(weekFor(candidate, 0))) id = candidate;
    }
    expect(id, 'no account id in fifty changed the generated week').not.toBe('');
    const expected = weekFor(id, varietyFor(id));

    const user = await createUser({ id });
    await context.addCookies([sessionCookie(user, baseURL!)]);
    await completeOnboarding(page);
    await expect(page.getByRole('heading', { name: 'Train', exact: true })).toBeVisible();

    await expect.poll(() => installedWeek(user.id), { timeout: 30_000 }).toEqual(expected);
    expect(await installedWeek(user.id)).not.toEqual(weekFor(id, 0));
  });

  test('does not ask again on a later visit', async ({ app }) => {
    await completeOnboarding(app);
    await app.goto('/train');
    await expect(app).toHaveURL(/\/train/);
    await expect(app.getByRole('heading', { name: 'Train' })).toBeVisible();
  });

  test('the generated week covers every pattern', async ({ app }) => {
    await completeOnboarding(app);
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    // Three days, five slots each.
    await expect(app.getByRole('heading', { name: 'Day A' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Swap' })).toHaveCount(15);

    /* And the week installed covers every counted pattern — the guarantee the
       generator's repair pass exists to give, here after the round trip
       through setup and the database. Read off the exercises the week holds,
       mapped back to their movement through the catalogue: the Week tab names
       no pattern per row, and its seven tiles list the split's goal whatever
       the week contains (`splits.spec.ts` holds those). */
    const names = await app
      .getByRole('button', { name: /^About / })
      .evaluateAll((els) =>
        els.map((e) => (e.getAttribute('aria-label') ?? '').replace(/^About /, '')),
      );
    const patternOf = new Map(CATALOGUE.map((c) => [c.name, c.pattern]));
    const covered = new Set(names.map((n) => patternOf.get(n)));
    for (const p of ['squat', 'hinge', 'lunge', 'push', 'pull', 'rotate', 'carry']) {
      expect(covered, `no ${p} in the installed week`).toContain(p);
    }
  });

  test('starts tracking a strength score as soon as it trains', async ({
    page: app,
    context,
    baseURL,
  }) => {
    /* The point of asking for bodyweight during setup. Every account in
       production had trained and had no strength score at all, because the
       score is a ratio and nothing had ever asked for the denominator — so
       the app's headline number only worked for people who went looking for
       a field in Settings.

       Any account will do. The index takes real weights and pull-ups,
       chin-ups and dips only (Decision log D-022), and Day A opens on the
       squat's main slot, which prefers a lift the index counts. Before that,
       about two accounts in five opened on a Leg Press or a Hack Squat, and
       this test had to pick an account that did not. The id is still ours,
       so the card it opens on can be named. */
    const id = randomUUID();
    const user = await createUser({ id });
    await context.addCookies([sessionCookie(user, baseURL!)]);

    await completeOnboarding(app, { weight: 78.5 });
    await expect(app.getByRole('heading', { name: openingLift(id), exact: true })).toBeVisible();
    await logSet(app, 60, 8);
    // Waited for: the set has to be in the local store before Progress can
    // read it, and a bare goto races that. Read back rather than assumed — see
    // `recordedSet` for why "60 kg × 8" is not a safe thing to expect here.
    await recordedSet(app, 8);

    await app.goto('/progress');
    await expect(app.getByRole('heading', { name: 'Strength index' })).toBeVisible({
      timeout: 15_000,
    });
    // Both numbers wait on bodyweight, so neither may still be asking for it.
    await expect(app.getByText('Add your bodyweight and this starts tracking.')).toHaveCount(0);
    /* The index, as a real number rather than a dash. Matched on its own shape —
       always one decimal place. This used to be "any span that is only digits",
       which stopped meaning the index the day the index gained its decimal: it
       went on passing, matching some other number on the page. */
    await expect(
      app
        .locator('span')
        .filter({ hasText: /^\d+\.\d$/ })
        .first(),
    ).toBeVisible();
  });

  test('says what is missing when the weight question is skipped', async ({ app }) => {
    /* The other half, and what makes the test above mean something: skipping
       leaves the score genuinely unavailable, and the page says so rather
       than inventing a denominator. */
    await completeOnboarding(app, { weight: null });
    await logSet(app, 60, 8);
    // Waited for: the set has to be in the local store before Progress can
    // read it, and a bare goto races that.
    await recordedSet(app, 8);

    await app.goto('/progress');
    await expect(app.getByText('Add your bodyweight and this starts tracking.')).toBeVisible({
      timeout: 15_000,
    });
  });
});
