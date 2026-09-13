'use client';

/**
 * The way out when the app is wedged.
 *
 * A local-first app can get stuck in a way a server-rendered one cannot: the
 * bad state is *on the device*. A corrupt or half-migrated IndexedDB, or a
 * service worker serving a shell that crashes on load, survives every reload
 * and every restart — which is precisely how someone ends up staring at a
 * loading screen that never resolves, with no way to tell the app to start
 * over.
 *
 * So the escape hatch throws away everything the device is holding and lets the
 * next load rebuild it from the server. That is safe for anything already
 * synced and lossy for anything not, which is why the caller has to say so
 * plainly and count what is pending before offering it.
 */

import { local } from './db';

/** Best-effort throughout: a step that fails must not block the rest. */
export async function resetDevice(): Promise<void> {
  try {
    await local.delete();
  } catch {
    /* Already gone, or blocked by another tab — the reload sorts it out. */
  }

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* No Cache Storage in this context. */
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* No service worker to remove. */
  }

  // Straight to the root rather than reload(): whatever route wedged the app is
  // the one thing not worth returning to.
  window.location.replace('/');
}
