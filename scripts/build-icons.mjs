/**
 * Renders the PWA icons from the one source mark.
 *
 * `apps/web/public/icons/logo.svg` is the only place the logo's geometry lives. The
 * three PNGs a manifest needs are produced from it here rather than drawn
 * separately, so they cannot drift from the mark the app itself renders — which
 * is exactly how an app ends up with a home-screen icon that is a version
 * behind everything else.
 *
 * Chromium does the rasterising, borrowed from the e2e workspace's Playwright
 * rather than adding an image-processing dependency for three files that change
 * about once a year.
 *
 *   node scripts/build-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const at = (p) => fileURLToPath(new URL(p, root));

/** Matches `--color-bg` in the dark theme, so the splash screen the manifest
 *  paints behind the icon is the same colour the app opens on. */
const BACKGROUND = '#1b1a19';

const svg = readFileSync(at('apps/web/public/icons/logo.svg'), 'utf8');

/**
 * `maskable` is cropped to a circle by Android, so the mark is inset to the
 * safe zone — 80% of the width is the platform's guidance, and a full-bleed
 * mark simply loses its ends.
 */
const targets = [
  { file: 'icon-192.png', size: 192, inset: 0.2 },
  { file: 'icon-512.png', size: 512, inset: 0.2 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.26 },
];

const page = (size, inset) => `<!doctype html>
<style>
  html, body { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; background: ${BACKGROUND};
         display: grid; place-items: center; }
  svg { width: ${Math.round(size * (1 - inset * 2))}px; height: auto; }
</style>
${svg}`;

const browser = await chromium.launch();
try {
  for (const { file, size, inset } of targets) {
    const tab = await browser.newPage({ viewport: { width: size, height: size } });
    await tab.setContent(page(size, inset));
    writeFileSync(at(`apps/web/public/icons/${file}`), await tab.screenshot());
    await tab.close();
    console.log(`wrote apps/web/public/icons/${file} (${size}px)`);
  }
} finally {
  await browser.close();
}
