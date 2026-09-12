'use client';

import { useEffect } from 'react';
import { useLang } from '@/lib/client/hooks';

/**
 * Keeps `<html lang>` in step with the language actually being displayed.
 *
 * The root layout is a server component and the real answer lives in IndexedDB,
 * so the attribute cannot be rendered correctly server-side — it has to be
 * corrected once the profile is known. Without this the document claims to be
 * English throughout a Hungarian session, which is what a screen reader reads
 * it as and what a browser offers to translate from.
 */
export function HtmlLang() {
  const lang = useLang();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
