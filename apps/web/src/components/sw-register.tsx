'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Without it the app still works offline for *logging* — that lives in
 * IndexedDB — but a reload could not even fetch the document, which is exactly
 * what happens when someone's screen locks mid-session.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Dev serves uncached assets and re-compiles constantly; a worker there
    // causes more confusion than it prevents.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* Offline support is a bonus, never a requirement for the app to run. */
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
