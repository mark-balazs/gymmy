import { expect, test } from '../fixtures/test';

test.describe('Exercise detail', () => {
  test('is reachable while planning the week, not just while training', async ({
    onboardedApp: app,
  }) => {
    await app.getByRole('link', { name: 'Week', exact: true }).click();
    await app.waitForURL('**/week');

    await app
      .getByRole('button', { name: /^About / })
      .first()
      .click();

    const sheet = app.getByRole('dialog');
    await expect(sheet.getByRole('img', { name: 'Starting position' })).toBeVisible();
  });

  test('the name opens photographs and a description', async ({ onboardedApp: app }) => {
    const info = app.getByRole('button', { name: /^About / }).first();
    await expect(info).toBeVisible();
    const name = (await info.getAttribute('aria-label'))!.replace(/^About /, '');

    await info.click();

    const sheet = app.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await expect(sheet.getByRole('img', { name: 'Starting position' })).toBeVisible();
    await expect(sheet.getByRole('img', { name: 'Finishing position' })).toBeVisible();
  });

  test('the photographs actually load', async ({ onboardedApp: app }) => {
    // A path pointing at a file that was never vendored renders as a broken
    // box, which no assertion about the markup would ever notice.
    const failed: string[] = [];
    app.on('response', (r) => {
      if (r.url().includes('/exercises/') && r.status() >= 400)
        failed.push(`${r.status()} ${r.url()}`);
    });

    await app
      .getByRole('button', { name: /^About / })
      .first()
      .click();
    const sheet = app.getByRole('dialog');
    await expect(sheet.getByRole('img').first()).toBeVisible();

    // Polled, because decoding is asynchronous: a width read the instant the
    // sheet opens says nothing about whether the file behind it exists.
    await expect
      .poll(() =>
        sheet
          .getByRole('img')
          .evaluateAll(
            (imgs) =>
              imgs.map((i) => (i as HTMLImageElement).naturalWidth).filter((w) => w > 0).length,
          ),
      )
      .toBeGreaterThanOrEqual(2);

    expect(failed).toEqual([]);
  });
});
