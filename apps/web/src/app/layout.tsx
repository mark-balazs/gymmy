import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { HtmlLang } from '@/components/html-lang';
import { HtmlTheme } from '@/components/html-theme';
import { BOOT_WATCHDOG, BootSignal } from '@/components/boot-watchdog';

export const metadata: Metadata = {
  title: 'gymmy',
  description: 'Do it for you. Train every way your body moves, and actually get stronger.',
  applicationName: 'gymmy',
  appleWebApp: { capable: true, title: 'gymmy', statusBarStyle: 'black-translucent' },
  manifest: '/manifest.webmanifest',
  icons: {
    // The vector first, so a browser tab gets the mark at whatever size it
    // decides it wants; the PNG behind it for anything that cannot read SVG.
    // Apple's touch icon must be a raster, so it stays a PNG outright.
    icon: [
      { url: '/icons/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Both are `--color-bg` for that theme. A near miss shows up as a hairline
  // of the wrong colour above the header on every scroll.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1b1a19' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6f9' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Before anything else, and deliberately not a module: if the bundle
            fails to load there is no React, no boundary and no way out without
            it. See components/boot-watchdog.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
        <BootSignal />
        {children}
        <HtmlLang />
        <HtmlTheme />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
