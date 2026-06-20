import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ripple-icon.svg', 'favicon.svg', 'push-sw.js'],
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Ripple',
        short_name: 'Ripple',
        description: 'A simple to-do app for tasks, subtasks, and reminders.',
        theme_color: '#2E84A7',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'ripple-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
