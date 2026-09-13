/** Flow 06 — see ../flows/06-language.md */

import { expect, test } from '../fixtures/test';

test.describe('Language', () => {
  test('switches to Hungarian across the whole interface', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();

    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();
    await expect(app.getByRole('link', { name: 'Fejlődés' })).toBeVisible();
    await expect(app.getByRole('link', { name: 'Beállítások' })).toBeVisible();
  });

  test('translates the coverage tiles', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();
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

  test('uses Hungarian ordinals and no plural after a numeral', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();
    await app.getByRole('link', { name: 'Edzés' }).click();

    // "1. nap", with the full stop — not "Nap 1".
    await expect(app.getByRole('button', { name: '1. nap' })).toBeVisible();

    // Hungarian takes no plural after a numeral. Appending an "s" is the
    // instinctive English implementation and it is wrong here.
    await expect(app.getByText(/\d+ sorozat\b/)).toBeVisible();
    await expect(app.getByText(/sorozatok/)).toHaveCount(0);
  });

  test('persists across a reload and sets the document language', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();

    // What a screen reader announces the page in, and what a browser offers to
    // translate from. The test was named for this long before it checked it.
    await expect(app.locator('html')).toHaveAttribute('lang', 'hu');

    await app.reload();

    // Stored on the profile, so it follows the account rather than the browser.
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();
    await expect(app.locator('html')).toHaveAttribute('lang', 'hu');
  });

  test('renders no hydration mismatch in either language', async ({ onboardedApp: app }) => {
    // The browser's language list is unreadable on the server, so detecting it
    // during the first render made the server send English and the client
    // render Hungarian — a mismatch on the opening paint of every Hungarian
    // session. Detection is deferred past hydration instead.
    const errors: string[] = [];
    app.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();
    await app.reload();
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();

    expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
  });

  test('switches back to English', async ({ onboardedApp: app }) => {
    await app.getByRole('link', { name: 'Settings', exact: true }).click();
    await app.getByRole('button', { name: 'Magyar' }).click();
    await expect(app.getByRole('link', { name: 'Edzés' })).toBeVisible();

    await app.getByRole('button', { name: 'English' }).click();
    await expect(app.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
  });
});
