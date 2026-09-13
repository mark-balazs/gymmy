import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { HtmlLang } from '@/components/html-lang';
import { HtmlTheme } from '@/components/html-theme';
import { BOOT_WATCHDOG, BootSignal } from '@/components/boot-watchdog';

export const metadata: Metadata = {
  title: 'gymmy',
  description: 'Train every way your body moves, and actually get stronger.',
  applicationName: 'gymmy',
  appleWebApp: { capable: true, title: 'gymmy', statusBarStyle: 'black-translucent' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0e11' },
    { media: '(prefers-color-scheme: light)', color: '#f5f7f9' },
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
