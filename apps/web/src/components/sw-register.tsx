'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and keeps the installed app up to date.
 *
 * Without it the app still works offline for *logging* — that lives in
 * IndexedDB — but a reload could not even fetch the document, which is exactly
 * what happens when someone's screen locks mid-session.
 *
 * ## Staying current
 *
 * An installed PWA is not a browser tab. It can sit in the app switcher for
 * weeks without ever being cold-started, so "it updates on the next visit" is
 * not true of it — there may not be a next visit. Three things have to line up,
 * and all three are easy to get almost right:
 *
 *  1. The worker's bytes must differ per deploy, or the browser never adopts
 *     one. `scripts/build-sw.mjs` stamps a build id in for that reason.
 *  2. Something has to *ask*. `registration.update()` runs when the app is
 *     brought back to the foreground and once an hour for a session left open.
 *     `updateViaCache: 'none'` stops the browser answering that question from
 *     its own HTTP cache, which it will otherwise do for up to 24 hours.
 *  3. The open page has to reload, because the new worker controls the page but
 *     the JavaScript already parsed in it is still the old version.
 *
 * The reload waits until the app is hidden. Weight and reps live in component
 * state while a set is being entered, so refreshing under someone mid-set would
 * throw away what they had typed to deliver an update they never asked about.
 * Backgrounding the app is both the safe moment and a very frequent one — it
 * happens every time the phone goes in a pocket between sets.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Dev serves uncached assets and re-compiles constantly; a worker there
    // causes more confusion than it prevents.
    if (process.env.NODE_ENV !== 'production') return;

    let disposed = false;
    let reloading = false;
    const timers: ReturnType<typeof setInterval>[] = [];

    /** Refresh onto the new worker, but never over the top of someone working. */
    const reloadWhenHidden = () => {
      if (reloading || disposed) return;
      reloading = true;
      if (document.visibilityState === 'hidden') {
        window.location.reload();
        return;
      }
      const onHide = () => {
        if (document.visibilityState === 'hidden') {
          document.removeEventListener('visibilitychange', onHide);
          window.location.reload();
        }
      };
      document.addEventListener('visibilitychange', onHide);
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          updateViaCache: 'none',
        });

        const check = () => void reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        timers.push(setInterval(check, 60 * 60 * 1000));

        // The worker calls skipWaiting, so a new one takes over as soon as it
        // installs; this is the signal that the page is now behind it.
        navigator.serviceWorker.addEventListener('controllerchange', reloadWhenHidden);
      } catch {
        /* Offline support is a bonus, never a requirement for the app to run. */
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });

    return () => {
      disposed = true;
      timers.forEach(clearInterval);
    };
  }, []);

  return null;
}
