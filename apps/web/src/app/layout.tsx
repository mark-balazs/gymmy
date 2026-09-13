import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { HtmlLang } from '@/components/html-lang';

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
        {children}
        <HtmlLang />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
