/// <reference types="vitest/config" />
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// "source" makes the workspace package resolve to its TypeScript sources
// (packages/ivories/package.json exports) -- no alias into packages/ivories/src.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The reader (bare 'pepperscore', loaded by <Notation> on demand) is served unbundled in dev, as before;
  // pepperscore/audio (ivories' engine) is pre-bundled with its smplr and soundfont2 dependencies.
  optimizeDeps: { exclude: ['pepperscore'] },
  resolve: { conditions: ['source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions], externalConditions: ['source'] } },
  server: { host: '0.0.0.0' },
  test: { name: 'studio', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
