import type { Page } from '@playwright/test';
import { expect, logSet, signInAs, test } from '../fixtures/test';

/**
 * The hero number on Progress: gymmy's own index.
 *
 * Matched on the decimal, which is the thing that distinguishes it. It used to
 * be "the only span that is nothing but digits" — true while there was one
 * number on the card, and quietly wrong the moment a DOTS score appeared
 * beside it, since that one *is* nothing but digits. The index is always
 * rendered to one decimal place, deliberately and including a trailing zero,
 * so this is exact rather than a near-enough guess.
 */
const strengthScore = (page: Page) =>
  page
    .locator('span')
    .filter({ hasText: /^\d+\.\d$/ })
    .first();

/**
 * The profile section.
 *
 * The interesting assertion is not that the fields exist — it is that the year
 * of birth **reaches the strength score**. The score has supported an age
 * allowance for some time and there was nowhere to enter an age, so that code
 * had never once run for a real person. A test that only typed into the box and
 * read it back would have passed against exactly that.
 */
test.describe('Your profile', () => {
  const seeded = {
    onboarded: true,
    history: { split: 'sevenPattern', weeksBack: 4, exercises: ['Goblet Squat'] },
  } as const;

  test('remembers a name across a reload', async ({ page, context, baseURL }) => {
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Mark');
    // Committed on blur rather than on every keystroke — otherwise the field
    // fights you, syncing and re-rendering under the cursor.
    await name.blur();
    /* The stored value, once the write has committed: after blur the field
       drops what was typed and shows the profile's name, which is empty until
       the write lands. Reloading before then can unload the page ahead of the
       write, and the name is simply gone — a flake that blames the feature. */
    await expect(name).toHaveValue('Mark');

    await page.reload();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Mark', {
      timeout: 15_000,
    });
  });

  test('refuses a year that cannot be a birth year', async ({ page, context, baseURL }) => {
    /* A typo here shifts the age allowance on every week of the score, and
       silently — so it is rejected rather than stored and quietly ignored.

       Rejected, and nothing written: a bad year mapped to "no year" and saved
       would erase the one already there, which an account with no year on
       record could never show. So there is one on record first. And both ends
       of the range, because the upper bound is this year and nothing else
       holds it. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    const year = page.getByLabel('Year of birth');
    await year.fill('1990');
    await year.blur();
    await expect(year).toHaveValue('1990');

    await year.fill('19');
    await year.blur();
    await expect(page.getByText(/Enter a year between 1900 and \d{4}/)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Year of birth')).toHaveValue('1990', { timeout: 15_000 });

    const thisYear = new Date().getFullYear();
    await page.getByLabel('Year of birth').fill(String(thisYear + 1));
    await page.getByLabel('Year of birth').blur();
    await expect(page.getByText(`Enter a year between 1900 and ${thisYear}.`)).toBeVisible();

    await page.getByLabel('Year of birth').fill('1990');
    await page.getByLabel('Year of birth').blur();
    await expect(page.getByText(/Enter a year between/)).toBeHidden();
  });

  test('the year of birth changes the strength score', async ({ page, context, baseURL }) => {
    /* The whole point of collecting it. A masters lifter's score is adjusted
     * upward for age, so the same lifting with an older birth year must not
     * produce the same number — and if it does, the field is decoration. */
    await signInAs(page, context, baseURL!, seeded);
    await logSet(page, 100, 5);
    await expect(page.getByText('100 kg × 5').first()).toBeVisible();

    await page.goto('/settings');
    await page.getByLabel('Sex').selectOption('male');
    await page.getByLabel('Height').fill('180');
    await page.getByLabel('Height').blur();

    await page.goto('/progress');
    await page.getByPlaceholder(/Today \(kg\)/).fill('80');
    await page.getByRole('button', { name: 'Save' }).click();

    const score = strengthScore(page);
    await expect(score).toBeVisible({ timeout: 15_000 });
    const noAllowance = Number(await score.textContent());
    expect(noAllowance).toBeGreaterThan(0);

    await page.goto('/settings');
    const year = page.getByLabel('Year of birth');
    await year.fill('1955');
    await year.blur();
    /* Wait for the write to land before navigating. Blur queues it and the
       navigation used to race it, which made this fail against a score that was
       simply correct for a missing birth year — the worst kind of flake,
       because it accuses the feature.

       The field is the witness: after blur it shows the profile's year, which
       is empty until the write commits. Reloading to check, as this used to,
       could unload the page ahead of the write — and a year lost that way
       never comes back however many reloads follow. */
    await expect(year).toHaveValue('1955');

    await page.goto('/progress');
    /* Strictly higher, not merely different. The masters allowance scales a
       score up with age, so "different" would also be satisfied by the field
       being wired to the wrong thing — or backwards. */
    await expect
      .poll(async () => Number(await score.textContent()), { timeout: 15_000 })
      .toBeGreaterThan(noAllowance);
  });

  test('gathers everything about you into one card', async ({ page, context, baseURL }) => {
    // Name, age and picture had nowhere to go, while sex and height sat under a
    // separate "About you" heading — a different box for facts of the same kind.
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'You', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About you' })).toBeHidden();

    const you = page.getByRole('region', { name: 'You' });
    // Not `exact`: for a wrapping <label> around a <select>, the computed label
    // text picks up every option as well ("Sex" plus "Male", "Female"…), so an
    // exact match can never succeed on a dropdown. Scoping to the region is
    // what makes the loose match unambiguous.
    for (const label of ['Name', 'Year of birth', 'Sex', 'Height']) {
      await expect(you.getByLabel(label)).toBeVisible();
    }
    // Exactly one, not `.first()` of two: the avatar used to be a button and
    // sit beside a text button that did the same thing. The words beside it
    // are a caption for the picture, not a second button.
    await expect(you.getByRole('button', { name: 'Add a picture' })).toHaveCount(1);
    await expect(you.getByText('Add a picture', { exact: true })).toBeVisible();

    /* Why year of birth and sex are asked sits behind an ⓘ on each label, not
       as a paragraph under each field — and is still there, one tap away,
       because being asked about sex without a reason is fair to be wary of. */
    await expect(you.getByText(/Only used for DOTS/)).toBeHidden();
    await you.getByRole('button', { name: 'Why the app asks this' }).click();
    await expect(page.getByRole('note', { name: 'Why the app asks this' })).toContainText(
      'Only used for DOTS',
    );
    await you.getByRole('button', { name: 'Why your age matters' }).click();
    await expect(page.getByRole('note', { name: 'Why your age matters' })).toContainText(
      'From age 40',
    );
  });

  /** A real 8×8 PNG. `createImageBitmap` has to decode this before any of the
   *  code under test runs, so a stub buffer would fail in the wrong place. */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAaklEQVR4nBWNQREAQQzCkFIpSKmUSEFKpSDlbnlmmEQSIyxWICJOVEjDDB52YMhwQwfJjLFZg4k5UyMts3jZhSXLLV2kJ8APvgUO+ucUJjhsHk640PyNYw4fe++c447e3yhTXLZPkXKl5QPGe1gBrfdehAAAAABJRU5ErkJggg==',
    'base64',
  );

  test('a picture can be removed and put straight back', async ({ page, context, baseURL }) => {
    /* Removing was a bare text link sitting directly under another bare text
       link, and it was instant and final — a mis-tap cost you the picture and
       the crop. It is now undoable, and the undo has to *write*: restoring it
       to the screen alone would leave it gone on the next load, which is the
       worst of the three possible behaviours. */
    await signInAs(page, context, baseURL!, { onboarded: true });
    await page.goto('/settings');

    const you = page.getByRole('region', { name: 'You' });
    await you
      .locator('input[type=file]')
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });

    // The one control changes what it says once there is something to change.
    await expect(you.getByRole('button', { name: 'Change picture' })).toHaveCount(1);
    await expect(you.getByRole('button', { name: 'Add a picture' })).toBeHidden();

    await you.getByRole('button', { name: 'Remove picture' }).click();
    await expect(you.getByRole('button', { name: 'Add a picture' })).toBeVisible();
    await expect(you.getByText('Picture removed.')).toBeVisible();

    await you.getByRole('button', { name: 'Undo' }).click();
    await expect(you.getByRole('button', { name: 'Change picture' })).toBeVisible();

    // The part that separates an undo from a redraw.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Change picture' })).toBeVisible({
      timeout: 15_000,
    });
  });
});
