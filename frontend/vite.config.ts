/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app always calls relative /api/... URLs. In dev, Vite forwards them to the
// FastAPI server; in Docker nginx does it, and on Vercel a rewrite does.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'node',
  },
})
