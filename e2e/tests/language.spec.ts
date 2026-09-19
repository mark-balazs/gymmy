/** Flow 06 — see ../flows/06-language.md */

import { profileLang, sessionCookie } from '../fixtures/auth';
import { expect, signInAs, test } from '../fixtures/test';

/** The language picker names itself in whichever language is showing. */
const LANGUAGE_LABEL = /Language|Nyelv|Sprache|Idioma|Langue/;

test.describe('Language', () => {
  test('switches to Hungarian across the whole interface', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByLabel(LANGUAGE_LABEL).selectOption('hu');

    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();
    await expect(app.getByRole('link', { name: 'Fejlődés' })).toBeVisible();
    await expect(app.getByRole('link', { name: 'Beállítások' })).toBeVisible();
  });

  test('translates the coverage tiles', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByLabel(LANGUAGE_LABEL).selectOption('hu');
    await app.getByRole('link', { name: 'Hét' }).click();

    for (const name of [
      'Guggolás',
      'Csípőhajlítás',
      'Kitörés',
      'Nyomás',
      'Húzás',
      'Forgatás',
      'Cipelés',
    ]) {
      await expect(app.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('labels days A nap, numbers sets with an ordinal', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByLabel(LANGUAGE_LABEL).selectOption('hu');
    await app.getByRole('link', { name: 'Edzés' }).click();

    // Lettered days read as "A nap", the way Hungarian labels "A csoport".
    await expect(app.getByRole('button', { name: 'A nap' })).toBeVisible();
    // And the one ordinal on Train, with its full stop: "1. sorozat", never
    // "sorozat 1".
    await expect(app.getByRole('button', { name: '1. sorozat rögzítése' })).toBeVisible();
  });

  test('takes no plural after a numeral', async ({ page, context, baseURL }) => {
    /* Hungarian takes no plural after a numeral: "2 sorozat", never "2
       sorozatok". Appending an "s" is the instinctive English implementation
       and it is wrong here.

       Checked on a count that goes through the plural rule. The day counter on
       Train is a fixed template with the noun already in it, so it read
       "sorozat" whatever the rule did — and a page-wide ban on "sorozatok" is
       wrong the other way, because Hungarian uses the plural where no numeral
       precedes it ("Rögzített sorozatok"). So: a lift with two sets, on
       Progress, and the word straight after the number — not followed by
       "ok", rather than by a word boundary, because the change figure beside it
       follows with no space. */
    await signInAs(page, context, baseURL!, {
      onboarded: true,
      history: { split: 'sevenPattern', weeksBack: 2, exercises: ['Goblet Squat'], sessions: 2 },
    });
    await page.goto('/settings');
    await page.getByLabel(LANGUAGE_LABEL).selectOption('hu');
    await page.getByRole('link', { name: 'Fejlődés' }).click();
    await expect(page.getByRole('button', { name: 'Goblet guggolás megnyitása' })).toContainText(
      /\b2 sorozat(?!ok)/,
      { timeout: 15_000 },
    );
  });

  test('persists across a reload and sets the document language', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const user = await signInAs(page, context, baseURL!, { onboarded: true });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel(LANGUAGE_LABEL).selectOption('hu');
    await expect(page.getByRole('link', { name: 'Edzés' })).toBeVisible();

    // What a screen reader announces the page in, and what a browser offers to
    // translate from. The test was named for this long before it checked it.
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');

    await page.reload();
    await expect(page.getByRole('link', { name: 'Edzés' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hu');

    /* Stored on the profile, so it follows the account rather than the
       browser. A reload cannot show that — it re-reads this device, and a
       choice kept in localStorage would survive it just as well — so the
       server is asked, and then a second browser that has never seen it. The
       server is waited on first: a second device opened before the push would
       be English, correctly. */
    await expect.poll(() => profileLang(user.id), { timeout: 15_000 }).toBe('hu');
    const second = await browser.newContext({ baseURL });
    try {
      await second.addCookies([sessionCookie(user, baseURL!)]);
      const other = await second.newPage();
      await other.goto('/train');
      await expect(other.getByRole('link', { name: 'Edzés' })).toBeVisible({ timeout: 30_000 });
      await expect(other.locator('html')).toHaveAttribute('lang', 'hu');
    } finally {
      await second.close();
    }
  });

  test('switches back to English', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByLabel(LANGUAGE_LABEL).selectOption('hu');
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();

    await app.getByLabel(LANGUAGE_LABEL).selectOption('en');
    await expect(app.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
  });
});

/**
 * No hydration mismatch, whatever language the browser speaks.
 *
 * The mismatch this guards came from reading the browser's language list
 * during the first render: the server cannot see it, so it sent English, and a
 * Hungarian browser's first client render was Hungarian. It is the browser's
 * locale that decides that first render, not the profile — the profile is read
 * from IndexedDB after hydration — so the check runs once per browser locale.
 * Setting the profile to Hungarian, as this used to, never touched the first
 * render at all.
 *
 * And React's production build does not say "hydration": a mismatch arrives as
 * "Minified React error #418" on the page's error channel, so both channels
 * are listened to and both wordings matched. The listeners go on before the
 * first navigation, which is why this signs in by hand.
 */
for (const locale of ['en-US', 'hu-HU']) {
  test.describe(`Hydration, with the browser in ${locale}`, () => {
    test.use({ locale });

    test('renders no hydration mismatch', async ({ page, context, baseURL }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      await signInAs(page, context, baseURL!, { onboarded: true });
      await page.reload();
      await expect(page.getByRole('heading', { name: /Train|Edzés/ })).toBeVisible();

      expect(errors.filter((e) => /hydrat|Minified React error #(418|423|425)/i.test(e))).toEqual(
        [],
      );
    });
  });
}
