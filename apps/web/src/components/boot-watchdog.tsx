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
 *
 * **It never deletes training.** It used to delete the database outright, so
 * the one screen a stranded person reaches was also the one that threw away
 * the sets their phone was still holding (GYM-78). What is broken is the copy
 * of the *app*: the service worker and its caches. So that is all it removes,
 * and only once a fresh `/` has come back from the network — there is no point
 * throwing away the only copy of the shell while the server is unreachable.
 * IndexedDB is never touched by anything on this screen.
 *
 * Three shapes, because the right move differs:
 *
 * - **Offline** — clearing the cached copy would leave nothing to load and no
 *   way to fetch a replacement. So it clears nothing and offers a retry.
 * - **Online, first time** — fetch `/`, then drop the service worker and its
 *   caches, then reload.
 * - **Online, and the reset already ran** — stop. The owner's rule: never wipe
 *   training as a last resort. Show what went wrong in a form somebody can
 *   copy into a support mail, and leave the device exactly as it is.
 */

const BOOT_FLAG = '__gymmyBooted';
const GRACE_MS = 15_000;

/** Set just before the reset reloads, so a second failure knows to stop. */
const RESET_KEY = 'gymmy.bootReset';
/** After this long, a fresh failure is a fresh problem and may reset again. */
const RESET_WINDOW_MS = 30 * 60 * 1000;

/** Inlined into the document, so it runs even if no other script does. */
export const BOOT_WATCHDOG = `
(function () {
  var TITLE = 'gymmy could not start';
  var TEXT = {
    offline: 'This device is offline, and gymmy needs a connection to fetch a fresh copy. Nothing on this device has been changed.',
    reset: 'This device has a broken copy of gymmy. Resetting downloads a fresh one. Your training stays on this device, including anything still waiting to sync.',
    stuckTitle: 'Resetting did not help',
    stuck: 'A fresh copy did not fix it, so nothing more will be tried here. Nothing on this device has been deleted. Copy the message below and send it to support.',
    unreachable: 'gymmy could not be reached just now, so nothing was changed. Try again in a moment.',
    retry: 'Try again',
    go: 'Reset and reload',
    copy: 'Copy the message',
    copied: 'Copied'
  };

  /* What went wrong, for the message somebody sends on. Collected from the
     first moment of the document, because by the time the panel appears the
     errors that mattered have long since fired. */
  var errors = [];
  function note(message) {
    if (!message) return;
    if (errors.length > 4 || errors.indexOf(message) > -1) return;
    errors.push(message);
  }
  window.addEventListener('error', function (e) {
    note(e && e.message ? e.message : String((e && e.error) || 'script error'));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    note(r && r.message ? r.message : String(r));
  });

  function el(tag, style, text) {
    var node = document.createElement(tag);
    if (style) node.setAttribute('style', style);
    if (text) node.textContent = text;
    return node;
  }

  var BTN = 'min-height:46px;border:0;border-radius:12px;font-weight:600;cursor:pointer;' +
    'font:inherit;padding:0 16px';

  function tried() {
    try {
      var at = Number(window.localStorage.getItem('${RESET_KEY}') || 0);
      return at > 0 && Date.now() - at < ${RESET_WINDOW_MS};
    } catch (e) {
      /* Blocked site data: treat it as a first attempt. Clearing the app copy
         is harmless either way — it is the wipe that is not, and there is no
         wipe here. */
      return false;
    }
  }

  /* The app's copy of itself, and nothing else. No indexedDB: the database is
     the one thing on this device that may hold the only copy of a set. */
  function clearAppCopy() {
    var jobs = [];
    if (window.caches) {
      jobs.push(caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }));
    }
    if (navigator.serviceWorker) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
        return Promise.all(rs.map(function (r) { return r.unregister(); }));
      }));
    }
    return Promise.all(jobs);
  }

  setTimeout(function () {
    if (window.${BOOT_FLAG}) return;
    try {
      var offline = navigator.onLine === false;
      var stuck = !offline && tried();

      var page = el('div', 'min-height:100dvh;display:grid;place-items:center;padding:24px;' +
        'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#1b1a19;color:#f0eee6');
      var card = el('div', 'max-width:420px;width:100%;display:flex;flex-direction:column;gap:12px');
      page.appendChild(card);

      card.appendChild(el('h1', 'font-size:19px;margin:0', stuck ? TEXT.stuckTitle : TITLE));
      var body = el('p', 'font-size:14px;color:#a5a299;margin:0',
        stuck ? TEXT.stuck : offline ? TEXT.offline : TEXT.reset);
      card.appendChild(body);

      if (stuck) {
        var box = el('pre', 'font-size:12px;color:#a5a299;margin:0;padding:12px;border-radius:12px;' +
          'background:#262422;white-space:pre-wrap;word-break:break-word;user-select:text',
          (errors.join('\\n') || 'No error message was reported.') + '\\n' + location.href);
        card.appendChild(box);

        var copy = el('button', BTN + ';background:#3a3733;color:#f0eee6', TEXT.copy);
        copy.addEventListener('click', function () {
          try {
            navigator.clipboard.writeText(box.textContent).then(function () {
              copy.textContent = TEXT.copied;
            });
          } catch (e) { /* the text is selectable either way */ }
        });
        card.appendChild(copy);
      }

      if (!stuck && !offline) {
        var go = el('button', BTN + ';background:#22c55e;color:#06180f', TEXT.go);
        go.addEventListener('click', function () {
          go.disabled = true;
          /* A fresh \`/\` first. Clearing the cached copy is only an improvement
             if there is a replacement to download; with the server down it
             would turn a broken app into no app. The query makes the service
             worker miss and go to the network for it. */
          fetch('/?boot=' + Date.now(), { cache: 'no-store' })
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return clearAppCopy();
            })
            .then(function () {
              try { window.localStorage.setItem('${RESET_KEY}', String(Date.now())); } catch (e) {}
              location.replace('/');
            })
            .catch(function () {
              go.disabled = false;
              body.textContent = TEXT.unreachable;
            });
        });
        card.appendChild(go);
      }

      var retry = el('button', BTN + ';background:#3a3733;color:#f0eee6', TEXT.retry);
      retry.addEventListener('click', function () { location.reload(); });
      card.appendChild(retry);

      document.body.innerHTML = '';
      document.body.appendChild(page);
    } catch (e) { /* nothing further to try */ }
  }, ${GRACE_MS});
})();
`;

/** Tells the watchdog to stand down. Rendered as early as the tree allows. */
export function BootSignal() {
  useEffect(() => {
    (window as unknown as Record<string, boolean>)[BOOT_FLAG] = true;
    /* The app is up, so whatever the last reset was for is over. Left behind,
     * it would send the next unrelated failure straight to "resetting did not
     * help" and offer nothing. */
    try {
      localStorage.removeItem(RESET_KEY);
    } catch {
      /* Blocked site data; `tried()` already treats that as a first attempt. */
    }
  }, []);
  return null;
}
