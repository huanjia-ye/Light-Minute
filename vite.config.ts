import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/__light_parakeet': {
        target: 'http://127.0.0.1:8179',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__light_parakeet/u, ''),
      },
      '/__light_whisper': {
        target: 'http://127.0.0.1:8178',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/__light_whisper/u, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['backups/**', 'node_modules/**', 'dist/**'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
  },
})
