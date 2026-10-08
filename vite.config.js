import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Installable on Android (Chrome's install prompt) and iOS (Share → Add to
    // Home Screen). The service worker precaches the app shell only; Firestore,
    // Auth and Storage requests always go to the network. Off in dev so a
    // cached shell never hides an edit — `npm run build && npm run preview` to test it.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // src/pwa.js registers it and surfaces updates
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'HAU-SOC Thesis and Capstone Workflow System',
        short_name: 'HAU-SOC Capstone',
        description: 'Thesis and capstone project management and workflow for the HAU School of Computing.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // The art is full-bleed with the shield inside the safe zone, so it doubles as maskable.
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Notification taps and real push (src/notifications.js).
        importScripts: ['sw-notify.js'],
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webp,woff2}'],
        // pdf.js and its worker are large; keep them in the precache so the viewer opens offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Firebase Auth's hosted handlers (email verification links) must reach the server.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          // Seeded sample manuscripts: hashed, so safe to keep once opened (too big to precache).
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.+\.pdf$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'sample-pdfs', expiration: { maxEntries: 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5180 },
  test: {
    // Never let a test reach Firebase, whatever .env says.
    env: { VITE_BACKEND: 'local', VITE_USE_EMULATORS: 'false' },
  },
})
