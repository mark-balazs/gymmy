import { EXERCISE_DETAILS } from '../../packages/domain/src/details';
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
    /* And the description, which nothing else reads. It reaches the sheet only
       through the library's join with the details table, and a sheet that lost
       it falls back to a polite placeholder — so the words themselves, and not
       the placeholder. */
    await expect(sheet.getByText(EXERCISE_DETAILS[name]!.description)).toBeVisible();
    await expect(sheet.getByText('No description for this one yet.')).toHaveCount(0);
  });

  test('a photograph opens large when you tap it', async ({ onboardedApp: app }) => {
    /* Side by side in the sheet each photograph is a cropped third of a
     * phone's width — enough to recognise a movement you already know, not
     * enough to learn one you do not. */
    await app
      .getByRole('button', { name: /^About / })
      .first()
      .click();

    const sheet = app.getByRole('dialog').first();
    await sheet.getByRole('button', { name: 'Enlarge: Starting position' }).click();

    const large = app.getByRole('dialog', { name: 'Starting position' });
    const shot = large.getByRole('img', { name: 'Starting position' });
    await expect(shot).toBeVisible();

    /* The claim is that it is bigger, so measure it. A lightbox that opened at
     * the same size as the thumbnail would satisfy every assertion about
     * markup and none about the point. */
    const thumb = (await sheet.getByRole('img', { name: 'Starting position' }).boundingBox())!;
    const opened = (await shot.boundingBox())!;
    expect(opened.width).toBeGreaterThan(thumb.width * 1.8);

    // And it covers the screen rather than the sheet it opened from — which is
    // what the portal is for: a `fixed` child of the sheet's blurred overlay
    // would size itself to the sheet instead.
    const viewport = app.viewportSize()!;
    const box = (await large.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);

    // Paging renames the dialog, because what it is *of* is what it is called.
    // Scoped and exact: Next.js's own dev-tools button is also called 'Next'.
    await large.getByRole('button', { name: 'Next', exact: true }).click();
    const second = app.getByRole('dialog', { name: 'Finishing position' });
    await expect(second.getByRole('img', { name: 'Finishing position' })).toBeVisible();
    await expect(large).toBeHidden();

    await app.keyboard.press('Escape');
    await expect(app.getByRole('dialog', { name: 'Finishing position' })).toBeHidden();
    // The sheet it opened from is still there, rather than having gone with it.
    await expect(sheet.getByRole('img', { name: 'Starting position' })).toBeVisible();
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
