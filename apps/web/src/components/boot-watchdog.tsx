'use client';

import { useEffect } from 'react';

/**
 * The last line of defence, and the only one that works when the app never
 * starts.
 *
 * Every other recovery path in this codebase — the error boundaries, the
 * loading deadline — is React code inside the application bundle. That is fine
 * for a crash *during* rendering and useless for the failure that actually
 * strands people: a service worker serving a cached shell whose script bundle
 * no longer exists. Nothing mounts, no boundary catches anything, and every
 * reload reproduces it exactly, because the broken copy is on the device.
 *
 * So the watchdog is a string of plain DOM in the document itself. It cannot
 * import anything, cannot depend on the bundle loading, and does nothing at all
 * if the app comes up — `BootSignal` sets a flag the moment React mounts.
 */

const BOOT_FLAG = '__gymmyBooted';
const GRACE_MS = 15_000;

/** Inlined into the document, so it runs even if no other script does. */
export const BOOT_WATCHDOG = `
(function () {
  var TEXT = {
    title: 'gymmy could not start',
    body: 'This device has a broken copy of gymmy. Resetting downloads a fresh one. Anything not yet synced from this device will be lost.',
    button: 'Reset and reload'
  };
  setTimeout(function () {
    if (window.${BOOT_FLAG}) return;
    try {
      document.body.innerHTML =
        '<div style="min-height:100dvh;display:grid;place-items:center;padding:24px;' +
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#1b1a19;color:#f0eee6">' +
        '<div style="max-width:420px;display:flex;flex-direction:column;gap:12px">' +
        '<h1 style="font-size:19px;margin:0">' + TEXT.title + '</h1>' +
        '<p style="font-size:14px;color:#a5a299;margin:0">' + TEXT.body + '</p>' +
        '<button id="gymmy-reset" style="min-height:46px;border:0;border-radius:12px;' +
        'background:#22c55e;color:#06180f;font-weight:600;cursor:pointer">' + TEXT.button + '</button>' +
        '</div></div>';
      document.getElementById('gymmy-reset').addEventListener('click', function () {
        var done = function () { location.replace('/'); };
        var jobs = [];
        try {
          if (navigator.serviceWorker) {
            jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
              return Promise.all(rs.map(function (r) { return r.unregister(); }));
            }));
          }
          if (window.caches) {
            jobs.push(caches.keys().then(function (ks) {
              return Promise.all(ks.map(function (k) { return caches.delete(k); }));
            }));
          }
          if (window.indexedDB && indexedDB.deleteDatabase) {
            indexedDB.deleteDatabase('athletic-tracker');
          }
        } catch (e) { /* reset is best effort; the reload still helps */ }
        Promise.all(jobs).then(done, done);
        setTimeout(done, 4000);
      });
    } catch (e) { /* nothing further to try */ }
  }, ${GRACE_MS});
})();
`;

/** Tells the watchdog to stand down. Rendered as early as the tree allows. */
export function BootSignal() {
  useEffect(() => {
    (window as unknown as Record<string, boolean>)[BOOT_FLAG] = true;
  }, []);
  return null;
}
