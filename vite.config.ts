import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kategoria',
        short_name: 'Kategoria',
        description: 'Kid-friendly word game — find words, beat the clock, have fun!',
        // Colors mirror design/tokens.json (light theme bg + primary).
        theme_color: '#0E7C72',
        background_color: '#FFF8F0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole static build (JS, CSS, fonts, word lists) so
        // solo and pass-&-play work fully offline; dictionary checking and
        // P2P already degrade gracefully without network.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        // The font package ships a Vietnamese subset the app never draws
        // (no Vietnamese pack; Hebrew/Arabic fall back to system fonts).
        globIgnores: ['**/nunito-vietnamese-*'],
      },
    }),
  ],
});
