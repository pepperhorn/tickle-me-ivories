/// <reference types="vitest/config" />
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** pepperscore is an optional peer of ivories. Until it is installed, importing it
    rejects at runtime (Notation shows notation-unavailable) instead of failing the build (R9). */
function optionalPepperscore(): Plugin {
  const MISSING = '\0ivories-pepperscore-missing'
  return {
    name: 'ivories-optional-pepperscore',
    enforce: 'pre',
    async resolveId(id, importer, opts) {
      if (id !== 'pepperscore') return null
      const real = await this.resolve(id, importer, { ...opts, skipSelf: true })
      return real ?? MISSING
    },
    load(id) {
      return id === MISSING ? 'throw new Error("pepperscore is not installed")' : null
    },
  }
}

// "source" makes the workspace package resolve to its TypeScript sources
// (packages/ivories/package.json exports) -- no alias into packages/ivories/src.
export default defineConfig({
  plugins: [optionalPepperscore(), react(), tailwindcss()],
  optimizeDeps: { exclude: ['pepperscore'] },
  resolve: { conditions: ['source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions], externalConditions: ['source'] } },
  server: { host: '0.0.0.0' },
  test: { name: 'studio', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
