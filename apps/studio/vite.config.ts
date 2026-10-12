/// <reference types="vitest/config" />
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// "source" makes the workspace package resolve to its TypeScript sources
// (packages/ivories/package.json exports) -- no alias into packages/ivories/src.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions], externalConditions: ['source'] } },
  server: { host: '0.0.0.0' },
  test: { name: 'studio', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
