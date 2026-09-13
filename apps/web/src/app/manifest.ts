import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'gymmy',
    short_name: 'gymmy',
    description: 'Do it for you. Train every way your body moves, and actually get stronger.',
    start_url: '/train',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Both match `--color-bg` in the dark theme, so the splash screen is the
    // colour the app actually opens on rather than a near miss.
    background_color: '#1b1a19',
    theme_color: '#1b1a19',
    categories: ['health', 'fitness'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
