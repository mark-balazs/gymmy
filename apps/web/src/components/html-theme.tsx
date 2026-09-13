'use client';

import { useEffect } from 'react';
import { useProfile } from '@/lib/client/hooks';

/**
 * Applies the chosen theme to the document.
 *
 * The preference lives in IndexedDB, which the server cannot read, so the root
 * layout cannot render the attribute correctly — it has to be corrected once
 * the profile is known. 'system' removes the attribute entirely rather than
 * writing a resolved value, so the CSS media query stays live and the app
 * follows the device if it flips to dark at sunset.
 */
export function HtmlTheme() {
  const profile = useProfile();
  const theme = profile?.theme ?? 'system';

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  return null;
}
