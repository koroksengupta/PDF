import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages /<repo>/).
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
