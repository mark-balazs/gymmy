import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'gymmy',
    short_name: 'gymmy',
    description: 'Train every way your body moves, and actually get stronger.',
    start_url: '/train',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0e11',
    theme_color: '#0b0e11',
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
